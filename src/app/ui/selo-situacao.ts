import { Component, computed, input } from '@angular/core';
import type { Situacao } from '../api/tipos';
import { Selo, type Tom } from './selo';

const APARENCIA: Record<Situacao, { rotulo: string; tom: Tom }> = {
  META_ATINGIDA: { rotulo: 'Meta atingida', tom: 'ok' },
  ATENCAO: { rotulo: 'Atenção', tom: 'atencao' },
  ABAIXO_DO_ALERTA: { rotulo: 'Abaixo do alerta', tom: 'perigo' },
  SEM_META: { rotulo: 'Sem meta', tom: 'neutro' },
};

/** Situação da unidade frente à meta (RN-03). */
@Component({
  selector: 'aurora-selo-situacao',
  imports: [Selo],
  template: `<aurora-selo [tom]="aparencia().tom">{{ aparencia().rotulo }}</aurora-selo>`,
})
export class SeloSituacao {
  readonly situacao = input.required<Situacao>();
  protected readonly aparencia = computed(() => APARENCIA[this.situacao()]);
}
