import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';

export type Tema = 'dark' | 'light';

/** Tema claro/escuro pelo atributo data-theme; a preferência fica salva no navegador. */
@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly documento = inject(DOCUMENT);

  readonly tema = signal<Tema>(this.documento.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark');

  constructor() {
    effect(() => {
      const tema = this.tema();
      this.documento.documentElement.dataset['theme'] = tema;
      try {
        localStorage.setItem('aurora.tema', tema);
      } catch {
        // Armazenamento indisponível (aba privada): o tema vale só nesta sessão.
      }
    });
  }

  alternar(): void {
    this.tema.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }
}
