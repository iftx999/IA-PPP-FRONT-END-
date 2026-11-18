import { setWorkerUrl } from 'maplibre-gl';

/** Prepara o MapLibre antes do primeiro mapa: folha de estilos e worker servidos pela própria aplicação. */
export function prepararMaplibre(): void {
  if (!document.querySelector('link[data-maplibre]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'maplibre.css';
    link.dataset['maplibre'] = '';
    document.head.appendChild(link);
  }
  setWorkerUrl(new URL('/maplibre/maplibre-gl-worker.mjs', window.location.origin).href);
}
