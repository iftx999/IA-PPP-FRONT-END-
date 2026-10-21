import { Component, input } from '@angular/core';

export type Tom = 'ok' | 'atencao' | 'perigo' | 'neutro';

/** Pílula com ponto + texto (docs/07, 7.5). A cor nunca é o único sinal: o texto vem sempre junto. */
@Component({
  selector: 'aurora-selo',
  template: `<span class="ponto" aria-hidden="true"></span><ng-content />`,
  host: { '[class]': 'tom()' },
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
    :host(.ok) { --cor: var(--ok); }
    :host(.atencao) { --cor: var(--warn); }
    :host(.perigo) { --cor: var(--danger); }
    .ponto { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  `,
})
export class Selo {
  readonly tom = input<Tom>('neutro');
}
