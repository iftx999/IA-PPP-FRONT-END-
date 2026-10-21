import { HttpClient, httpResource } from '@angular/common/http';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import type { LinhaMeta, Metas as DadosMetas, Situacao } from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { competenciaCurta, numero, percentual } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { SeloSituacao } from '../../ui/selo-situacao';

type Origem = 'TODAS' | 'CONTRATO' | 'MANUAL' | 'HERDADA' | 'SEM_META';

function hoje(): string {
  return new Date().toLocaleDateString('sv-SE'); // yyyy-MM-dd no fuso do navegador
}

/** Metas por unidade (épico C): árvore com herança, meta própria e encerramento. */
@Component({
  selector: 'aurora-metas',
  imports: [ReactiveFormsModule, SeloSituacao],
  templateUrl: './metas.html',
  styleUrl: './metas.scss',
})
export class Metas {
  private readonly http = inject(HttpClient);
  protected readonly sessao = inject(SessaoService);

  protected readonly dados = httpResource<DadosMetas>(() => '/api/v1/metas');
  protected readonly metas = computed(() => (this.dados.hasValue() ? this.dados.value() : undefined));

  protected readonly busca = signal('');
  protected readonly filtroSituacao = signal<Situacao | 'TODAS'>('TODAS');
  protected readonly filtroOrigem = signal<Origem>('TODAS');

  protected readonly linhas = computed(() => {
    const termo = this.busca().trim().toLocaleLowerCase('pt-BR');
    return (this.metas()?.linhas ?? []).filter(
      (l) =>
        (!termo || l.unidadeNome.toLocaleLowerCase('pt-BR').includes(termo)) &&
        (this.filtroSituacao() === 'TODAS' || l.situacao === this.filtroSituacao()) &&
        (this.filtroOrigem() === 'TODAS' || this.origemDa(l) === this.filtroOrigem()),
    );
  });

  private readonly dialogoNova = viewChild.required<ElementRef<HTMLDialogElement>>('dialogoNova');
  private readonly dialogoEncerrar = viewChild.required<ElementRef<HTMLDialogElement>>('dialogoEncerrar');

  protected readonly formulario = new FormGroup({
    unidadeId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    valor: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01), Validators.max(100)]),
    alerta: new FormControl<number | null>(null, [Validators.required, Validators.min(0), Validators.max(100)]),
    vigenciaInicio: new FormControl(hoje(), { nonNullable: true, validators: [Validators.required] }),
    vigenciaFim: new FormControl<string | null>(null),
  });
  protected readonly encerramento = new FormControl(hoje(), { nonNullable: true, validators: [Validators.required] });
  protected readonly emEncerramento = signal<LinhaMeta | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly fmt = { numero, percentual, competenciaCurta };

  protected origemDa(l: LinhaMeta): Origem {
    if (l.propria) {
      return l.propria.doContrato || l.propria.origem ? 'CONTRATO' : 'MANUAL';
    }
    return l.herdada ? 'HERDADA' : 'SEM_META';
  }

  protected vigencia(inicio: string, fim: string | null): string {
    const de = competenciaCurta(inicio.slice(0, 7));
    return fim ? `${de} – ${competenciaCurta(fim.slice(0, 7))}` : `desde ${de} · sem fim`;
  }

  protected abrirNova(linha?: LinhaMeta): void {
    this.erro.set(null);
    this.formulario.reset({
      unidadeId: linha?.unidadeId ?? '',
      valor: null,
      alerta: null,
      vigenciaInicio: hoje(),
      vigenciaFim: null,
    });
    this.dialogoNova().nativeElement.showModal();
  }

  protected abrirEncerrar(linha: LinhaMeta): void {
    this.erro.set(null);
    this.emEncerramento.set(linha);
    this.encerramento.reset(hoje());
    this.dialogoEncerrar().nativeElement.showModal();
  }

  protected fechar(dialogo: HTMLDialogElement): void {
    dialogo.close();
  }

  protected async salvarNova(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const valor = this.formulario.getRawValue();
    if ((valor.alerta ?? 0) > (valor.valor ?? 0)) {
      this.erro.set('O limite de alerta não pode ser maior que a meta.');
      return;
    }
    await this.enviar(
      () => this.http.post('/api/v1/metas', { ...valor, vigenciaFim: valor.vigenciaFim || null }),
      this.dialogoNova().nativeElement,
    );
  }

  protected async confirmarEncerramento(): Promise<void> {
    const linha = this.emEncerramento();
    if (!linha?.propria || this.encerramento.invalid) {
      return;
    }
    await this.enviar(
      () => this.http.post(`/api/v1/metas/${linha.propria!.id}/encerramento`, { fim: this.encerramento.value }),
      this.dialogoEncerrar().nativeElement,
    );
  }

  private async enviar(requisicao: () => ReturnType<HttpClient['post']>, dialogo: HTMLDialogElement): Promise<void> {
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await firstValueFrom(requisicao());
      dialogo.close();
      this.dados.reload();
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
