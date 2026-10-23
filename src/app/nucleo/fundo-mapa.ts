import { InjectionToken } from '@angular/core';

/** Camada de fundo do mapa (tiles raster) e a atribuição exigida pelo provedor. */
export interface FundoDoMapa {
  tiles: string[];
  atribuicao: string;
  tamanho: number;
  zoomMaximo: number;
}

/**
 * Fundo do mapa (ADR 0017). O padrão usa os tiles públicos do OpenStreetMap, aceitáveis em desenvolvimento;
 * a política de uso deles não admite tráfego de produção, então o ambiente da empresa deve fornecer este token
 * (em app.config) com o provedor contratado ou um servidor de tiles próprio.
 */
export const FUNDO_DO_MAPA = new InjectionToken<FundoDoMapa>('FUNDO_DO_MAPA', {
  providedIn: 'root',
  factory: () => ({
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    atribuicao: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    tamanho: 256,
    zoomMaximo: 19,
  }),
});
