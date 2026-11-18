import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Foto de uma OS (ADR 0045). Vem pela API autenticada (a leitura fica na trilha), então é
 * baixada como arquivo e mostrada por um endereço local, liberado ao sair.
 */
@Component({
  selector: 'aurora-foto-da-ordem',
  template: `
    @if (endereco(); as src) {
      <a [href]="src" target="_blank" rel="noopener" [attr.aria-label]="'Abrir ' + descricao()">
        <img [src]="src" [alt]="descricao()" loading="lazy" />
      </a>
    } @else if (falhou()) {
      <span class="falha nota">Foto indisponível</span>
    } @else {
      <span class="carregando" role="status" aria-label="Carregando foto"></span>
    }
  `,
  styles: `
    :host {
      display: block;
      inline-size: 7.5rem;
      block-size: 7.5rem;
      border-radius: var(--radius-s);
      overflow: hidden;
      border: var(--border);
      background: var(--bg-3);
    }
    a,
    img {
      display: block;
      inline-size: 100%;
      block-size: 100%;
    }
    img {
      object-fit: cover;
    }
    a:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }
    .falha,
    .carregando {
      display: grid;
      place-items: center;
      block-size: 100%;
      padding: 0.5rem;
      text-align: center;
    }
  `,
})
export class FotoDaOrdem {
  private readonly http = inject(HttpClient);

  readonly ordem = input.required<string>();
  readonly anexo = input.required<string>();
  readonly descricao = input('Foto da OS');

  protected readonly endereco = signal<string | null>(null);
  protected readonly falhou = signal(false);

  constructor() {
    effect(() => {
      const url = `/api/v1/ordens/${this.ordem()}/anexos/${this.anexo()}`;
      firstValueFrom(this.http.get(url, { responseType: 'blob' }))
        .then((blob) => this.endereco.set(URL.createObjectURL(blob)))
        .catch(() => this.falhou.set(true));
    });
    inject(DestroyRef).onDestroy(() => {
      const src = this.endereco();
      if (src) {
        URL.revokeObjectURL(src);
      }
    });
  }
}
