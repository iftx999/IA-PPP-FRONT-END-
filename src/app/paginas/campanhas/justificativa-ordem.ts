import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import type { MotivoDaOrdem, OrdemServico, PedidoJustificativa } from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { alvoDaOrdem, motivosPara } from './textos';

export interface DadosJustificativa {
  ordem: OrdemServico;
  /** Devolver (equipe, volta para a programação) ou cancelar (programador). */
  acao: 'DEVOLUCAO' | 'CANCELAMENTO';
  /** POST com { motivoId, observacao }. */
  url: string;
  motivos: readonly MotivoDaOrdem[];
}

const TEXTOS = {
  DEVOLUCAO: {
    titulo: 'Devolver',
    botao: 'Devolver',
    nota: 'A OS volta para a programação; o programador reprograma, troca a equipe ou cancela.',
  },
  CANCELAMENTO: {
    titulo: 'Cancelar',
    botao: 'Cancelar OS',
    nota: 'A OS sai da programação e não pode ser reaberta; crie outra se precisar.',
  },
};

/** Devolução ou cancelamento da OS com motivo do catálogo (RN-22, D8). */
@Component({
  selector: 'aurora-justificativa-ordem',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ textos.titulo }} OS {{ dados.ordem.numero }} · {{ dados.ordem.servicoNome }}
    </h2>
    <mat-dialog-content>
      <p class="alvo">{{ alvo }}</p>
      <form id="form-justificativa" [formGroup]="form" (ngSubmit)="salvar()" class="formulario">
        <mat-form-field>
          <mat-label>Motivo</mat-label>
          <mat-select formControlName="motivoId">
            @for (m of motivos; track m.id) {
              <mat-option [value]="m.id">{{ m.nome }}</mat-option>
            }
          </mat-select>
          <mat-error>Escolha o motivo.</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Observação {{ exigeObservacao() ? '' : '(opcional)' }}</mat-label>
          <textarea matInput formControlName="observacao" rows="3" maxlength="500"></textarea>
          <mat-hint align="end">{{ valores().observacao?.length ?? 0 }}/500</mat-hint>
        </mat-form-field>
        <p class="nota">{{ textos.nota }}</p>
        @if (erro()) {
          <p class="erro" role="alert">
            <span class="material-symbols-rounded" aria-hidden="true">error</span>{{ erro() }}
          </p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Voltar</button>
      <button matButton="filled" type="submit" form="form-justificativa" [disabled]="salvando()">
        @if (salvando()) {
          <mat-spinner diameter="18" />
        }
        {{ textos.botao }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .alvo {
      margin: 0 0 var(--space-3);
      color: var(--text-2);
    }
    .formulario {
      display: grid;
      gap: var(--space-2);
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
export class JustificativaOrdemDialogo {
  protected readonly dados = inject<DadosJustificativa>(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly referencia = inject(MatDialogRef<JustificativaOrdemDialogo, OrdemServico>);

  protected readonly textos = TEXTOS[this.dados.acao];
  protected readonly alvo = alvoDaOrdem(this.dados.ordem);
  protected readonly motivos = motivosPara(
    this.dados.motivos,
    this.dados.acao,
    this.dados.ordem.servicoId,
  );
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly form = new FormGroup({
    motivoId: new FormControl<string | null>(null, Validators.required),
    observacao: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });
  protected readonly valores = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly exigeObservacao = computed(
    () => !!this.motivos.find((m) => m.id === this.valores().motivoId)?.exigeObservacao,
  );

  protected async salvar(): Promise<void> {
    const v = this.form.getRawValue();
    if (!v.motivoId) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.exigeObservacao() && !v.observacao.trim()) {
      this.erro.set('Descreva o motivo na observação.');
      return;
    }
    const pedido: PedidoJustificativa = {
      motivoId: v.motivoId,
      observacao: v.observacao.trim() || null,
    };
    this.salvando.set(true);
    this.erro.set(null);
    try {
      this.referencia.close(
        await firstValueFrom(this.http.post<OrdemServico>(this.dados.url, pedido)),
      );
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
