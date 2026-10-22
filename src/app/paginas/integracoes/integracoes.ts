import { Clipboard } from '@angular/cdk/clipboard';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import type { CredencialApi, CredencialGerada, ExecucaoApi, FonteApi, PedidoFonte, ResultadoCarga } from '../../api/tipos';
import { AlertasService } from '../../nucleo/alertas';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { competenciaCurta, data, dataEHora, haQuantoTempo, numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { Selo, type Tom } from '../../ui/selo';

export const TIPOS_FONTE: Record<FonteApi['tipo'], string> = {
  AGENTE: 'Agente Aurora',
  ARQUIVO: 'Arquivo',
  CDC: 'Captura de mudanças (CDC)',
  API: 'API',
  ETL_JDBC: 'ETL (banco de dados)',
};

/** Atraso em horas → "2 dias", "36 horas". */
export function atraso(horas: number): string {
  if (horas % 24 === 0) {
    const dias = horas / 24;
    return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  }
  return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
}

/** As últimas competências, da atual para trás ("2026-10" → "out/2026"). */
export function ultimasCompetencias(quantidade: number, hoje = new Date()): { valor: string; rotulo: string }[] {
  return Array.from({ length: quantidade }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { valor, rotulo: competenciaCurta(valor) };
  });
}

/** Modelo do CSV de carga (o mesmo formato que o servidor lê). */
export const MODELO_CSV = 'matricula;unidade;situacao\n100001;CA-CENTRO;LIGADO\n100002;CA-CENTRO;FACTIVEL\n100003;CB-SUL;CORTADO\n100004;CB-SUL;POTENCIAL\n';

export function situacaoFonte(f: FonteApi): { rotulo: string; tom: Tom } {
  if (!f.ativo) {
    return { rotulo: 'Inativa', tom: 'neutro' };
  }
  if (f.atrasada) {
    return { rotulo: 'Atrasada', tom: 'atencao' };
  }
  if (f.situacaoUltimaExecucao === 'FALHA') {
    return { rotulo: 'Última carga falhou', tom: 'perigo' };
  }
  return { rotulo: 'Em dia', tom: 'ok' };
}

/** Integrações e cargas (H3, S11, RN-08). */
@Component({
  selector: 'aurora-integracoes',
  imports: [
    ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatSlideToggleModule, MatMenuModule, MatTooltipModule, MatProgressSpinnerModule, MatSnackBarModule, Selo,
  ],
  templateUrl: './integracoes.html',
  styleUrl: './integracoes.scss',
})
export class Integracoes {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly avisos = inject(MatSnackBar);
  private readonly areaDeTransferencia = inject(Clipboard);
  private readonly alertas = inject(AlertasService);
  protected readonly sessao = inject(SessaoService);

  private readonly podeGerir = computed(() => this.sessao.pode('integracao:gerenciar'));
  protected readonly dados = httpResource<FonteApi[]>(() => (this.podeGerir() ? '/api/v1/integracoes/fontes' : undefined));
  protected readonly fontes = computed(() => (this.dados.hasValue() ? this.dados.value() : undefined));
  protected readonly resumo = computed(() => {
    const lista = this.fontes() ?? [];
    return { total: lista.length, atrasadas: lista.filter((f) => f.atrasada).length, inativas: lista.filter((f) => !f.ativo).length };
  });

  protected readonly tipos = Object.entries(TIPOS_FONTE).map(([codigo, rotulo]) => ({ codigo: codigo as FonteApi['tipo'], rotulo }));
  protected readonly fmt = { competenciaCurta, data, dataEHora, haQuantoTempo, numero, atraso };
  protected readonly situacao = situacaoFonte;
  protected readonly rotuloTipo = (t: FonteApi['tipo']) => TIPOS_FONTE[t];

  // ----- Diálogos -----
  private readonly modeloFonte = viewChild.required<TemplateRef<unknown>>('modeloFonte');
  private readonly modeloHistorico = viewChild.required<TemplateRef<unknown>>('modeloHistorico');
  private readonly modeloCredenciais = viewChild.required<TemplateRef<unknown>>('modeloCredenciais');
  private readonly modeloCarga = viewChild.required<TemplateRef<unknown>>('modeloCarga');
  private dialogoAberto?: MatDialogRef<unknown>;

  protected readonly emEdicao = signal<FonteApi | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly formulario = new FormGroup({
    nome: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    tipo: new FormControl<FonteApi['tipo']>('AGENTE', { nonNullable: true }),
    sistemaOrigem: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
    frequencia: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(60)] }),
    atraso: new FormControl(2, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    unidadeAtraso: new FormControl<'horas' | 'dias'>('dias', { nonNullable: true }),
    ativo: new FormControl(true, { nonNullable: true }),
  });

  protected readonly execucoes = signal<ExecucaoApi[] | null>(null);
  protected readonly credenciais = signal<CredencialApi[] | null>(null);
  protected readonly chaveGerada = signal<CredencialGerada | null>(null);

  // ----- Carga por arquivo -----
  protected readonly competencias = ultimasCompetencias(24);
  protected readonly competencia = new FormControl(this.competencias[1]!.valor, { nonNullable: true });
  /** Só para o (ngSubmit): sem [formGroup] o envio seria o submit nativo. */
  protected readonly formCarga = new FormGroup({ competencia: this.competencia });
  protected readonly arquivoCarga = signal<File | null>(null);
  protected readonly resultadoCarga = signal<ResultadoCarga | null>(null);

  protected abrirNova(): void {
    this.erro.set(null);
    this.emEdicao.set(null);
    this.formulario.reset({ nome: '', tipo: 'AGENTE', sistemaOrigem: '', frequencia: '', atraso: 2, unidadeAtraso: 'dias', ativo: true });
    this.dialogoAberto = this.dialogos.open(this.modeloFonte(), { width: '560px', autoFocus: 'first-tabbable' });
  }

  protected abrirEdicao(f: FonteApi): void {
    this.erro.set(null);
    this.emEdicao.set(f);
    const emDias = f.atrasoMaximoHoras % 24 === 0;
    this.formulario.reset({
      nome: f.nome, tipo: f.tipo, sistemaOrigem: f.sistemaOrigem ?? '', frequencia: f.frequencia ?? '',
      atraso: emDias ? f.atrasoMaximoHoras / 24 : f.atrasoMaximoHoras, unidadeAtraso: emDias ? 'dias' : 'horas', ativo: f.ativo,
    });
    this.dialogoAberto = this.dialogos.open(this.modeloFonte(), { width: '560px', autoFocus: 'first-tabbable' });
  }

  protected async salvar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const v = this.formulario.getRawValue();
    const pedido: PedidoFonte = {
      nome: v.nome.trim(),
      tipo: v.tipo,
      sistemaOrigem: v.sistemaOrigem.trim() || null,
      frequencia: v.frequencia.trim() || null,
      atrasoMaximoHoras: v.unidadeAtraso === 'dias' ? v.atraso * 24 : v.atraso,
      ativo: v.ativo,
    };
    const f = this.emEdicao();
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await firstValueFrom(f ? this.http.put(`/api/v1/integracoes/fontes/${f.id}`, pedido) : this.http.post('/api/v1/integracoes/fontes', pedido));
      this.dialogoAberto?.close();
      this.avisos.open(f ? 'Fonte atualizada.' : 'Fonte cadastrada.', undefined, { duration: 4000 });
      this.dados.reload();
      this.alertas.resumo.reload();
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async abrirHistorico(f: FonteApi): Promise<void> {
    this.emEdicao.set(f);
    this.execucoes.set(null);
    this.dialogoAberto = this.dialogos.open(this.modeloHistorico(), { width: '920px' });
    this.execucoes.set(await firstValueFrom(this.http.get<ExecucaoApi[]>(`/api/v1/integracoes/fontes/${f.id}/execucoes`)).catch(() => []));
  }

  protected async abrirCredenciais(f: FonteApi): Promise<void> {
    this.emEdicao.set(f);
    this.chaveGerada.set(null);
    this.erro.set(null);
    this.dialogoAberto = this.dialogos.open(this.modeloCredenciais(), { width: '640px' });
    await this.carregarCredenciais(f);
  }

  protected async gerarCredencial(): Promise<void> {
    const f = this.emEdicao();
    if (!f) {
      return;
    }
    this.salvando.set(true);
    this.erro.set(null);
    try {
      this.chaveGerada.set(await firstValueFrom(this.http.post<CredencialGerada>(`/api/v1/integracoes/fontes/${f.id}/credenciais`, null)));
      await this.carregarCredenciais(f);
      this.dados.reload();
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async revogar(c: CredencialApi): Promise<void> {
    const f = this.emEdicao();
    try {
      await firstValueFrom(this.http.post(`/api/v1/integracoes/credenciais/${c.prefixo}/revogacao`, null));
      this.avisos.open(`Credencial ${c.prefixo} revogada. O agente que a usava deixa de enviar dados.`, undefined, { duration: 5000 });
      if (f) {
        await this.carregarCredenciais(f);
      }
      this.dados.reload();
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    }
  }

  protected duracao(inicio: string, fim: string): string {
    const segundos = Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 1000));
    return segundos < 60 ? `${segundos} s` : segundos < 3600 ? `${Math.round(segundos / 60)} min` : `${(segundos / 3600).toFixed(1).replace('.', ',')} h`;
  }

  protected abrirCarga(f: FonteApi): void {
    this.emEdicao.set(f);
    this.erro.set(null);
    this.arquivoCarga.set(null);
    this.resultadoCarga.set(null);
    this.competencia.reset(this.competencias[1]!.valor);
    this.dialogoAberto = this.dialogos.open(this.modeloCarga(), { width: '720px' });
  }

  protected escolherArquivo(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    this.arquivoCarga.set(campo.files?.[0] ?? null);
    campo.value = '';
    this.resultadoCarga.set(null);
    this.erro.set(null);
  }

  protected baixarModelo(): void {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + MODELO_CSV], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo-carga.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  protected async enviarCarga(): Promise<void> {
    const f = this.emEdicao();
    const arquivo = this.arquivoCarga();
    if (!f || !arquivo) {
      this.erro.set('Escolha o arquivo CSV.');
      return;
    }
    const corpo = new FormData();
    corpo.append('arquivo', arquivo, arquivo.name);
    this.salvando.set(true);
    this.erro.set(null);
    try {
      this.resultadoCarga.set(
        await firstValueFrom(
          this.http.post<ResultadoCarga>(`/api/v1/integracoes/fontes/${f.id}/cargas`, corpo, {
            params: { competencia: this.competencia.value },
          }),
        ),
      );
      this.arquivoCarga.set(null);
      this.dados.reload();
      this.alertas.resumo.reload();
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha, 'Não foi possível processar a carga.'));
    } finally {
      this.salvando.set(false);
    }
  }

  protected copiar(chave: string): void {
    this.areaDeTransferencia.copy(chave);
    this.avisos.open('Chave copiada.', undefined, { duration: 3000 });
  }

  protected fechar(): void {
    this.chaveGerada.set(null);
    this.dialogoAberto?.close();
  }

  private async carregarCredenciais(f: FonteApi): Promise<void> {
    this.credenciais.set(await firstValueFrom(this.http.get<CredencialApi[]>(`/api/v1/integracoes/fontes/${f.id}/credenciais`)).catch(() => []));
  }
}
