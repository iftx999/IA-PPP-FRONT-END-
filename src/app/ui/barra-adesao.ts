import { Component, computed, input } from '@angular/core';

/** Barra de adesão com marcador vertical na posição da meta (docs/07, 7.5). */
@Component({
  selector: 'aurora-barra-adesao',
  template: `
    <span class="preenchimento" [style.width.%]="largura()"></span>
    @if (meta() != null) {
      <span class="meta" [style.left.%]="meta()" title="Meta"></span>
    }
  `,
  host: { role: 'presentation' },
  styles: `
    :host {
      position: relative; display: block;
      height: 6px; min-width: 80px;
      border-radius: 999px;
      background: var(--bg-3);
    }
    .preenchimento { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: var(--accent-2); }
    .meta { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--text-1); }
  `,
})
export class BarraAdesao {
  readonly percentual = input<number | null>(null);
  readonly meta = input<number | null>(null);
  protected readonly largura = computed(() => Math.max(0, Math.min(100, this.percentual() ?? 0)));
}
