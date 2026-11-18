import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import type { MotivoDaOrdem, OrdemServico, PedidoResultado, ResultadoOrdem } from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { ROTULO_RESULTADO, alvoDaOrdem, motivosPara, quantidadeComUnidade } from './textos';

export interface DadosResultado {
  ordem: OrdemServico;
  /** Equipe (/api/v1/minhas-ordens) ou gestor (/api/v1/ordens). */
  base: string;
  /** Motivos do catálogo (os de não execução são filtrados aqui). */
  motivos: readonly MotivoDaOrdem[];
}

/**
 * Encerramento da OS (doc 10, 10.6): executada (com a quantidade feita) ou não executada (com o motivo do
 * catálogo). Parâmetros e fotos chegam com o app (M4).
 */
@Component({
  selector: 'aurora-resultado-ordem',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Encerrar OS {{ dados.ordem.numero }} · {{ dados.ordem.servicoNome }}</h2>
    <mat-dialog-content>
      <p class="imovel">{{ alvo }} · {{ dados.ordem.unidadeNome }}</p>
      <form id="form-resultado" [formGroup]="form" (ngSubmit)="salvar()" class="formulario">
        <mat-button-toggle-group
          formControlName="resultado"
          aria-label="Resultado"
          class="resultados"
        >
          @for (r of resultados; track r) {
            <mat-button-toggle [value]="r">{{ rotulo[r] }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
        @if (valores().resultado === 'NAO_EXECUTADA') {
          <mat-form-field>
            <mat-label>Motivo</mat-label>
            <mat-select formControlName="motivoId">
              @for (m of motivos; track m.id) {
                <mat-option [value]="m.id">{{ m.nome }}</mat-option>
              }
            </mat-select>
            <mat-error>Escolha o motivo.</mat-error>
          </mat-form-field>
        } @else {
          <mat-form-field>
            <mat-label>Quantidade executada ({{ unidade }})</mat-label>
            <input matInput type="number" formControlName="quantidade" min="0.01" step="0.01" />
            <mat-hint>Prevista: {{ prevista }}</mat-hint>
            <mat-error>Informe um valor maior que zero.</mat-error>
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>Observação {{ exigeObservacao() ? '' : '(opcional)' }}</mat-label>
          <textarea matInput formControlName="observacao" rows="3" maxlength="500"></textarea>
          <mat-hint align="end">{{ valores().observacao?.length ?? 0 }}/500</mat-hint>
        </mat-form-field>
        @if (valores().resultado === 'EXECUTADA' && conferida) {
          <p class="nota">
            A carga do sistema comercial vai confirmar a ligação (no mês da execução ou no
            seguinte).
          </p>
        }
        @if (erro()) {
          <p class="erro" role="alert">
            <span class="material-symbols-rounded" aria-hidden="true">error</span>{{ erro() }}
          </p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancelar</button>
      <button matButton="filled" type="submit" form="form-resultado" [disabled]="salvando()">
        @if (salvando()) {
          <mat-spinner diameter="18" />
        }
        Encerrar
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .imovel {
      margin: 0 0 var(--space-3);
      color: var(--text-2);
    }
    .formulario {
      display: grid;
      gap: var(--space-2);
    }
    .resultados {
      flex-wrap: wrap;
      margin-bottom: var(--space-2);
    }
    .nota {
      margin: 0;
      color: var(--text-3);
      font-size: var(--fs-small);
    }
    .erro {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      color: var(--danger);
      font-size: var(--fs-small);
    }
  `,
})
export class ResultadoOrdemDialogo {
  protected readonly dados = inject<DadosResultado>(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly referencia = inject(MatDialogRef<ResultadoOrdemDialogo, OrdemServico>);

  protected readonly resultados: ResultadoOrdem[] = ['EXECUTADA', 'NAO_EXECUTADA'];
  protected readonly rotulo = ROTULO_RESULTADO;
  protected readonly alvo = alvoDaOrdem(this.dados.ordem);
  protected readonly unidade = this.dados.ordem.unidadeMedida.toLowerCase();
  protected readonly prevista = quantidadeComUnidade(
    this.dados.ordem.quantidadePrevista,
    this.dados.ordem.unidadeMedida,
  );
  protected readonly motivos = motivosPara(
    this.dados.motivos,
    'NAO_EXECUCAO',
    this.dados.ordem.servicoId,
  );
  protected readonly conferida = ['LIGACAO_NOVA', 'RELIGACAO'].includes(
    this.dados.ordem.servicoCodigo,
  );
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly form = new FormGroup({
    resultado: new FormControl<ResultadoOrdem>('EXECUTADA', { nonNullable: true }),
    motivoId: new FormControl<string | null>(null),
    quantidade: new FormControl<number | null>(this.dados.ordem.quantidadePrevista, [
      Validators.min(0.01),
    ]),
    observacao: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });
  protected readonly valores = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly exigeObservacao = computed(
    () =>
      this.valores().resultado === 'NAO_EXECUTADA' &&
      !!this.motivos.find((m) => m.id === this.valores().motivoId)?.exigeObservacao,
  );

  constructor() {
    this.form.controls.resultado.valueChanges.subscribe(() => this.erro.set(null));
  }

  protected async salvar(): Promise<void> {
    const v = this.form.getRawValue();
    const naoExecutada = v.resultado === 'NAO_EXECUTADA';
    if (naoExecutada && !v.motivoId) {
      this.form.controls.motivoId.setErrors({ required: true });
      this.form.markAllAsTouched();
      return;
    }
    if (!naoExecutada && (v.quantidade == null || v.quantidade <= 0)) {
      this.form.controls.quantidade.setErrors({ min: true });
      this.form.markAllAsTouched();
      return;
    }
    if (this.exigeObservacao() && !v.observacao.trim()) {
      this.erro.set('Descreva o motivo na observação.');
      return;
    }
    const pedido: PedidoResultado = {
      resultado: v.resultado,
      motivoId: naoExecutada ? v.motivoId : null,
      observacao: v.observacao.trim() || null,
      quantidadeExecutada: naoExecutada ? null : v.quantidade,
    };
    this.salvando.set(true);
    this.erro.set(null);
    try {
      const ordem = await firstValueFrom(
        this.http.put<OrdemServico>(`${this.dados.base}/${this.dados.ordem.id}/resultado`, pedido),
      );
      this.referencia.close(ordem);
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
