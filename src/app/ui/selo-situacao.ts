import { Component, computed, input } from '@angular/core';
import type { Situacao } from '../api/tipos';

const ROTULOS: Record<Situacao, string> = {
  META_ATINGIDA: 'Meta atingida',
  ATENCAO: 'Atenção',
  ABAIXO_DO_ALERTA: 'Abaixo do alerta',
  SEM_META: 'Sem meta',
};

/** Selo de situação (RN-03): ponto + texto. A cor nunca é o único sinal (docs/07, 7.2). */
@Component({
  selector: 'aurora-selo-situacao',
  template: `<span class="ponto" aria-hidden="true"></span>{{ rotulo() }}`,
  host: { '[class]': 'situacao()' },
  styles: `
    :host {
      --cor: var(--neutral);
      display: inline-flex; align-items: center; gap: 6px;
      padding: 2px 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--cor) 12%, transparent);
      color: var(--cor);
      font: 500 var(--fs-small) var(--font-ui);
      white-space: nowrap;
    }
    :host(.META_ATINGIDA) { --cor: var(--ok); }
    :host(.ATENCAO) { --cor: var(--warn); }
    :host(.ABAIXO_DO_ALERTA) { --cor: var(--danger); }
    .ponto { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  `,
})
export class SeloSituacao {
  readonly situacao = input.required<Situacao>();
  protected readonly rotulo = computed(() => ROTULOS[this.situacao()]);
}
