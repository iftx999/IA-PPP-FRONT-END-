import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

/** Página provisória dos módulos que ainda serão entregues (plano de marcos em docs/06). */
@Component({
  selector: 'aurora-em-construcao',
  template: `
    <header class="cabecalho-pagina">
      <span class="rotulo">{{ secao() }}</span>
      <h1>{{ titulo() }}</h1>
    </header>
    <section class="cartao vazio">
      <p class="rotulo">Em construção</p>
      <p>Esta tela chega no <strong>{{ marco() }}</strong>.</p>
    </section>
  `,
  styles: `
    .cabecalho-pagina { display: grid; gap: var(--space-2); margin-bottom: var(--space-5); }
    h1 { font: 700 var(--fs-h1) var(--font-display); }
    .vazio { display: grid; gap: var(--space-2); max-width: 520px; }
    .vazio p { margin: 0; color: var(--text-2); }
  `,
})
export class EmConstrucao {
  private readonly dados = toSignal(inject(ActivatedRoute).data.pipe(map((d) => d as Record<string, string>)), {
    initialValue: {} as Record<string, string>,
  });

  protected readonly titulo = () => this.dados()['titulo'] ?? '';
  protected readonly secao = () => this.dados()['secao'] ?? '';
  protected readonly marco = () => this.dados()['marco'] ?? 'próximo marco';
}
