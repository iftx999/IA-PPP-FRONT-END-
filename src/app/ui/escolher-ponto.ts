import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  model,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Map as MapaLibre, Marker, NavigationControl } from 'maplibre-gl';
import { FUNDO_DO_MAPA } from '../nucleo/fundo-mapa';
import { prepararMaplibre } from '../nucleo/maplibre';
import { TemaService } from '../nucleo/tema';
import { estiloBase, lerCores } from '../paginas/mapa/estilo-mapa';

export interface Ponto {
  latitude: number;
  longitude: number;
}

/**
 * Escolha de um ponto no mapa (ex.: base da equipe, ADR 0046): clique ou arraste o marcador. Sem ponto, o mapa abre
 * no centro informado.
 */
@Component({
  selector: 'aurora-escolher-ponto',
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #mapa
      class="mapa"
      role="application"
      [attr.aria-label]="rotulo() + ': clique no mapa para marcar o ponto'"
    ></div>
    <div class="linha">
      <span class="nota">
        @if (ponto(); as p) {
          {{ p.latitude.toFixed(5) }}, {{ p.longitude.toFixed(5) }}
        } @else {
          Nenhum ponto marcado. Clique no mapa.
        }
      </span>
      @if (ponto()) {
        <button matButton type="button" (click)="ponto.set(null)">Limpar</button>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 4px;
    }
    .mapa {
      height: 220px;
      border-radius: var(--radius-md, 12px);
      overflow: hidden;
      border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
    }
    .linha {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 40px;
    }
  `,
})
export class EscolherPonto {
  readonly ponto = model<Ponto | null>(null);
  readonly rotulo = input('Ponto');
  /** Centro inicial quando não há ponto (longitude, latitude). */
  readonly centro = input<[number, number]>([-47.4, -22.6]);

  private readonly elemento = viewChild.required<ElementRef<HTMLElement>>('mapa');
  private readonly fundo = inject(FUNDO_DO_MAPA);
  private readonly tema = inject(TemaService);
  private mapa?: MapaLibre;
  private marcador?: Marker;

  constructor() {
    effect(() => {
      const elemento = this.elemento().nativeElement;
      if (!this.mapa) {
        this.criar(elemento);
      }
      this.posicionar(this.ponto());
    });
    inject(DestroyRef).onDestroy(() => this.mapa?.remove());
  }

  private criar(elemento: HTMLElement): void {
    prepararMaplibre();
    const inicial = this.ponto();
    const mapa = new MapaLibre({
      container: elemento,
      style: estiloBase(this.fundo, this.tema.tema() === 'dark'),
      center: inicial ? [inicial.longitude, inicial.latitude] : this.centro(),
      zoom: inicial ? 15 : 11,
      attributionControl: { compact: true },
    });
    mapa.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    mapa.on('click', (e) => this.ponto.set({ latitude: e.lngLat.lat, longitude: e.lngLat.lng }));
    new ResizeObserver(() => mapa.resize()).observe(elemento);
    this.mapa = mapa;
  }

  private posicionar(ponto: Ponto | null): void {
    if (!ponto) {
      this.marcador?.remove();
      this.marcador = undefined;
      return;
    }
    if (!this.marcador) {
      this.marcador = new Marker({ draggable: true, color: lerCores()['--accent'] })
        .setLngLat([ponto.longitude, ponto.latitude])
        .addTo(this.mapa!);
      this.marcador.on('dragend', () => {
        const p = this.marcador!.getLngLat();
        this.ponto.set({ latitude: p.lat, longitude: p.lng });
      });
    } else {
      this.marcador.setLngLat([ponto.longitude, ponto.latitude]);
    }
  }
}
