import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, type MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import type { RetencaoAuditoria } from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { dataEHora, numero } from '../../nucleo/formato';

/** "60 meses (5 anos)". */
export function descreverPrazo(meses: number | undefined): string {
  if (!meses) {
    return '';
  }
  const anos = meses / 12;
  const emAnos = Number.isInteger(anos) ? ` (${anos} ${anos === 1 ? 'ano' : 'anos'})` : '';
  return `${meses} meses${emAnos}`;
}

/**
 * Prazo de retenção da trilha de auditoria (doc 08, 8.7; ADR 0029): política do cliente, ao lado do MFA e do SSO.
 * Reduzir apaga, no expurgo diário, o que ficar fora do prazo; a tela avisa para exportar antes.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'aurora-retencao-auditoria',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './retencao-auditoria.html',
  styleUrl: './usuarios.scss',
})
export class RetencaoAuditoriaPolitica {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly avisos = inject(MatSnackBar);

  protected readonly dados = httpResource<RetencaoAuditoria>(
    () => '/api/v1/seguranca/retencao-auditoria',
  );
  protected readonly form = new FormGroup({
    // Texto só com dígitos (sem as setas do campo numérico do navegador).
    meses: new FormControl<string | null>(null, [
      Validators.required,
      Validators.pattern(/^\d{1,3}$/),
      Validators.min(12),
      Validators.max(240),
    ]),
  });
  private readonly valorMeses = toSignal(this.form.controls.meses.valueChanges, {
    initialValue: null,
  });
  /** Prazo digitado, para o aviso de redução (não numérico conta como sem redução). */
  protected readonly mesesInformados = computed(() => {
    const valor = Number(this.valorMeses());
    return Number.isFinite(valor) && valor > 0 ? valor : Number.MAX_SAFE_INTEGER;
  });
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly fmt = { numero, dataEHora, prazo: descreverPrazo };
  private readonly modelo = viewChild.required<TemplateRef<unknown>>('modelo');
  private dialogo: MatDialogRef<unknown> | null = null;

  protected abrir(): void {
    this.form.reset({
      meses: this.dados.hasValue() ? String(this.dados.value().meses ?? '') : null,
    });
    this.erro.set(null);
    this.dialogo = this.dialogos.open(this.modelo(), { width: '520px' });
  }

  protected fechar(): void {
    this.dialogo?.close();
  }

  protected async salvar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.salvando.set(true);
    this.erro.set(null);
    try {
      const novo = await firstValueFrom(
        this.http.put<RetencaoAuditoria>('/api/v1/seguranca/retencao-auditoria', {
          meses: Number(this.form.value.meses),
        }),
      );
      this.dados.set(novo);
      this.fechar();
      this.avisos.open(
        `A trilha de auditoria passa a guardar os eventos por ${descreverPrazo(novo.meses)}.`,
        undefined,
        {
          duration: 6000,
        },
      );
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
