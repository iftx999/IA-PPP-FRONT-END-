import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import type {
  MotivoResultado,
  OrdemServico,
  PedidoResultado,
  ResultadoOrdem,
} from '../../api/tipos';
import { paraIso } from '../../nucleo/datas';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { ROTULO_MOTIVO, ROTULO_RESULTADO, ROTULO_TIPO, motivosPara } from './textos';

export interface DadosResultado {
  ordem: OrdemServico;
  /** Equipe (/api/v1/minhas-ordens) ou gestor (/api/v1/campanhas/ordens). */
  base: string;
}

/** Resultado de campo de uma OS (I3): executada, recusada (motivo), reagendada (data) ou inviável (motivo). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'aurora-resultado-ordem',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>OS {{ dados.ordem.numero }} · {{ tipo[dados.ordem.tipo] }}</h2>
    <mat-dialog-content>
      <p class="imovel">
        Matrícula <b class="dado">{{ dados.ordem.matricula }}</b> · {{ dados.ordem.unidadeNome }}
      </p>
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
        @if (motivos().length) {
          <mat-form-field>
            <mat-label>Motivo</mat-label>
            <mat-select formControlName="motivo">
              @for (m of motivos(); track m) {
                <mat-option [value]="m">{{ rotuloMotivo[m] }}</mat-option>
              }
            </mat-select>
            <mat-error>Escolha o motivo.</mat-error>
          </mat-form-field>
        }
        @if (valores().resultado === 'REAGENDADA') {
          <mat-form-field>
            <mat-label>Nova data</mat-label>
            <input
              matInput
              [matDatepicker]="cal"
              formControlName="data"
              [min]="hoje"
              [max]="limite"
              placeholder="dd/mm/aaaa"
            />
            <mat-datepicker-toggle matIconSuffix [for]="cal" />
            <mat-datepicker #cal />
            <mat-error>Informe uma data de hoje até 180 dias.</mat-error>
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
        Registrar
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .imovel {
      margin: 0 0 var(--space-3);
      color: var(--text-2);
      b {
        color: var(--text-1);
      }
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

  protected readonly resultados: ResultadoOrdem[] = [
    'EXECUTADA',
    'RECUSADA',
    'REAGENDADA',
    'INVIAVEL',
  ];
  protected readonly rotulo = ROTULO_RESULTADO;
  protected readonly rotuloMotivo = ROTULO_MOTIVO;
  protected readonly tipo = ROTULO_TIPO;
  protected readonly conferida = ['LIGACAO_NOVA', 'RELIGACAO'].includes(this.dados.ordem.tipo);
  protected readonly hoje = new Date();
  protected readonly limite = new Date(Date.now() + 180 * 86_400_000);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly form = new FormGroup({
    resultado: new FormControl<ResultadoOrdem>('EXECUTADA', { nonNullable: true }),
    motivo: new FormControl<MotivoResultado | null>(null),
    data: new FormControl<Date | null>(null),
    observacao: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });
  protected readonly valores = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly motivos = computed(() => motivosPara(this.valores().resultado ?? 'EXECUTADA'));
  protected readonly exigeObservacao = computed(() => this.valores().motivo === 'OUTRO');

  constructor() {
    this.form.controls.resultado.valueChanges.subscribe(() => {
      this.form.controls.motivo.setValue(null);
      this.erro.set(null);
    });
  }

  protected async salvar(): Promise<void> {
    const v = this.form.getRawValue();
    if (this.motivos().length && !v.motivo) {
      this.form.controls.motivo.setErrors({ required: true });
      this.form.markAllAsTouched();
      return;
    }
    if (v.resultado === 'REAGENDADA' && !v.data) {
      this.form.controls.data.setErrors({ required: true });
      this.form.markAllAsTouched();
      return;
    }
    if (v.motivo === 'OUTRO' && !v.observacao.trim()) {
      this.erro.set('Descreva o motivo na observação.');
      return;
    }
    const pedido: PedidoResultado = {
      resultado: v.resultado,
      motivo: this.motivos().length ? v.motivo : null,
      observacao: v.observacao.trim() || null,
      reagendadaPara: v.resultado === 'REAGENDADA' ? paraIso(v.data) : null,
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
