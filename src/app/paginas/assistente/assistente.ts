import { Clipboard } from '@angular/cdk/clipboard';
import { NgTemplateOutlet } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import {
  Component, DestroyRef, ElementRef, TemplateRef, computed, effect, inject, input, linkedSignal, signal, untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';
import type {
  ConversaAssistente, ConversaComMensagens, MensagemAssistente, SituacaoAssistente,
} from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { dataEHora, haQuantoTempo } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { type Bloco, blocos, textoParaCopiar } from './texto-da-resposta';

const SUGESTOES = [
  'Quais setores estão abaixo do limite de alerta?',
  'Como está a adesão da concessão neste mês?',
  'Quanto falta para cada município atingir a meta?',
  'Quais alertas estão abertos?',
];

/**
 * Assistente com fontes (épico G): perguntas em português, respostas com chips numerados de fonte e linhas de dados
 * (G2), histórico com busca (G3), copiar e "Ajudou?" (G4), pergunta a partir do painel (G5). Números sem fonte nas
 * bases aparecem com aviso (G6).
 */
@Component({
  selector: 'aurora-assistente',
  imports: [
    NgTemplateOutlet, ReactiveFormsModule, MatButtonModule, MatDialogModule, MatExpansionModule, MatFormFieldModule, MatInputModule,
    MatProgressSpinnerModule, MatTooltipModule,
  ],
  templateUrl: './assistente.html',
  styleUrl: './assistente.scss',
})
export class Assistente {
  readonly conversa = input<string>();
  /** G5: unidade e pergunta sugeridas por outra tela (ex.: o painel). */
  readonly unidade = input<string>();
  readonly pergunta = input<string>();

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly dialogos = inject(MatDialog);
  private readonly clipboard = inject(Clipboard);
  protected readonly sessao = inject(SessaoService);

  private readonly fim = viewChild<ElementRef<HTMLElement>>('fim');
  private readonly campo = viewChild<ElementRef<HTMLTextAreaElement>>('campo');
  private readonly modeloAvaliacao = viewChild.required<TemplateRef<unknown>>('modeloAvaliacao');

  protected readonly podeUsar = computed(() => this.sessao.pode('assistente:usar'));

  protected readonly situacao = httpResource<SituacaoAssistente>(() =>
    this.podeUsar() ? '/api/v1/assistente/situacao' : undefined,
  );
  protected readonly disponivel = computed(() => this.situacao.hasValue() && this.situacao.value().disponivel);

  protected readonly busca = new FormControl('', { nonNullable: true });
  private readonly termo = signal('');
  protected readonly conversas = httpResource<ConversaAssistente[]>(() => {
    if (!this.podeUsar()) {
      return undefined;
    }
    const params: Record<string, string> = this.termo() ? { busca: this.termo() } : {};
    return { url: '/api/v1/assistente/conversas', params };
  });

  protected readonly aberta = httpResource<ConversaComMensagens>(() =>
    this.podeUsar() && this.conversa() ? `/api/v1/assistente/conversas/${this.conversa()}` : undefined,
  );
  /** Mensagens da conversa aberta, acrescidas das trocas desta sessão sem recarregar. */
  protected readonly mensagens = linkedSignal<MensagemAssistente[]>(() =>
    this.conversa() && this.aberta.hasValue() ? this.aberta.value().mensagens : [],
  );
  protected readonly titulo = computed(() =>
    this.conversa() && this.aberta.hasValue() ? this.aberta.value().conversa.titulo : 'Nova conversa',
  );

  protected readonly enviando = signal(false);
  protected readonly perguntaPendente = signal<string | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly copiada = signal<string | null>(null);
  /** Fonte destacada por mensagem (clique no chip abre a linha de dados). */
  protected readonly fonteAberta = signal<Record<string, number | null>>({});

  protected readonly formComposer = new FormGroup({
    pergunta: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(2000)] }),
  });
  protected readonly composer = this.formComposer.controls.pergunta;
  protected readonly formAvaliacao = new FormGroup({
    comentario: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });
  protected readonly avaliando = signal<MensagemAssistente | null>(null);
  private dialogo?: MatDialogRef<unknown>;

  protected readonly sugestoes = SUGESTOES;
  protected readonly fmt = { dataEHora, haQuantoTempo };

  constructor() {
    this.busca.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((valor) => this.termo.set(valor.trim()));
    // G5: pergunta sugerida chega preenchida (a pessoa confere e envia).
    effect(() => {
      const sugerida = this.pergunta();
      if (sugerida) {
        untracked(() => this.composer.setValue(sugerida));
      }
    });
    effect(() => {
      this.mensagens();
      this.perguntaPendente();
      queueMicrotask(() => this.fim()?.nativeElement.scrollIntoView({ block: 'end' }));
    });
  }

  protected blocos(mensagem: MensagemAssistente): Bloco[] {
    return blocos(mensagem.texto);
  }

  protected nova(): void {
    this.erro.set(null);
    this.composer.reset();
    void this.router.navigate([], { queryParams: { conversa: null, unidade: null, pergunta: null }, queryParamsHandling: 'merge' });
    queueMicrotask(() => this.campo()?.nativeElement.focus());
  }

  protected abrir(conversa: ConversaAssistente): void {
    this.erro.set(null);
    void this.router.navigate([], { queryParams: { conversa: conversa.id, unidade: null, pergunta: null } });
  }

  protected usarSugestao(texto: string): void {
    this.composer.setValue(texto);
    void this.enviar();
  }

  /** Enter envia; Shift+Enter quebra a linha. */
  protected tecla(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' && !evento.shiftKey && !evento.isComposing) {
      evento.preventDefault();
      void this.enviar();
    }
  }

  protected async enviar(): Promise<void> {
    const pergunta = this.composer.value.trim();
    if (!pergunta || this.enviando() || !this.disponivel()) {
      return;
    }
    this.enviando.set(true);
    this.erro.set(null);
    this.perguntaPendente.set(pergunta);
    this.composer.setValue('');
    try {
      const troca = await firstValueFrom(
        this.http.post<ConversaComMensagens>('/api/v1/assistente/perguntas', {
          conversaId: this.conversa() ?? null,
          pergunta,
          unidadeId: this.unidade() ?? null,
        }),
      );
      this.mensagens.update((atuais) => [...atuais, ...troca.mensagens]);
      this.conversas.reload();
      this.situacao.reload();
      if (troca.conversa.id !== this.conversa()) {
        // Conversa nova: entra na URL sem recarregar o que já está na tela.
        const atuais = this.mensagens();
        await this.router.navigate([], { queryParams: { conversa: troca.conversa.id, unidade: null, pergunta: null } });
        this.mensagens.set(atuais);
      }
    } catch (falha) {
      this.composer.setValue(pergunta);
      this.erro.set(mensagemDeErro(falha, 'Não foi possível responder agora. Tente de novo.'));
    } finally {
      this.perguntaPendente.set(null);
      this.enviando.set(false);
    }
  }

  protected alternarFonte(mensagem: MensagemAssistente, numero: number): void {
    this.fonteAberta.update((atual) => ({ ...atual, [mensagem.id]: atual[mensagem.id] === numero ? null : numero }));
  }

  protected copiar(mensagem: MensagemAssistente): void {
    this.clipboard.copy(textoParaCopiar(mensagem.texto));
    this.copiada.set(mensagem.id);
    setTimeout(() => this.copiada.set(null), 2000);
  }

  protected async ajudou(mensagem: MensagemAssistente): Promise<void> {
    await this.avaliar(mensagem, 1, null);
  }

  protected temErro(mensagem: MensagemAssistente): void {
    this.avaliando.set(mensagem);
    this.formAvaliacao.reset();
    this.dialogo = this.dialogos.open(this.modeloAvaliacao(), { width: '460px' });
  }

  protected async enviarAvaliacao(): Promise<void> {
    const mensagem = this.avaliando();
    if (!mensagem || this.formAvaliacao.invalid) {
      return;
    }
    await this.avaliar(mensagem, -1, this.formAvaliacao.controls.comentario.value.trim() || null);
    this.dialogo?.close();
  }

  protected fecharDialogo(): void {
    this.dialogo?.close();
  }

  private async avaliar(mensagem: MensagemAssistente, avaliacao: number, comentario: string | null): Promise<void> {
    try {
      await firstValueFrom(this.http.put(`/api/v1/assistente/mensagens/${mensagem.id}/avaliacao`, { avaliacao, comentario }));
      this.mensagens.update((todas) => todas.map((m) => (m.id === mensagem.id ? { ...m, avaliacao } : m)));
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    }
  }

  protected rotuloFonte(mensagem: MensagemAssistente, numero: number): string {
    const fonte = mensagem.fontes.find((f) => f.numero === numero);
    return fonte ? `Fonte ${numero}: ${fonte.titulo} · ${fonte.detalhe}` : `Fonte ${numero}`;
  }

  protected linhaDaFonte(mensagem: MensagemAssistente, numero: number) {
    return mensagem.dados.find((d) => d.fonte === numero);
  }

  protected campos(campos: Record<string, string>): [string, string][] {
    return Object.entries(campos);
  }
}
