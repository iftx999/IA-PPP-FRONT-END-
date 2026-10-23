import type { LngLatBounds } from 'maplibre-gl';
import type { CamadasMapa } from '../../api/tipos';
import {
  CAMADAS_DO_GRUPO, CAMADAS_PADRAO, areaVisivel, camadasDaAurora, colecoes, estiloBase, raioDoClique, rotuloQuantidade,
  urlDosTiles,
} from './estilo-mapa';

const limites = (oeste: number, sul: number, leste: number, norte: number) =>
  ({ getWest: () => oeste, getSouth: () => sul, getEast: () => leste, getNorth: () => norte }) as LngLatBounds;

describe('estilo do mapa', () => {
  it('rotula agrupamentos de forma curta', () => {
    expect(rotuloQuantidade(7)).toBe('7');
    expect(rotuloQuantidade(999)).toBe('999');
    expect(rotuloQuantidade(1000)).toBe('1 mil');
    expect(rotuloQuantidade(5_640)).toBe('5,6 mil');
    expect(rotuloQuantidade(18_167)).toBe('18 mil');
  });

  it('leva competência e camadas ligadas na URL dos tiles', () => {
    const url = urlDosTiles('http://aurora', '2026-08', {
      ...CAMADAS_PADRAO, situacoes: ['FACTIVEL', 'CORTADO'], aproximadas: false, rede: false,
    });
    expect(url).toBe('http://aurora/api/v1/mapa/tiles/{z}/{x}/{y}.mvt?competencia=2026-08&situacoes=FACTIVEL'
      + '&situacoes=CORTADO&aproximadas=false&rede=false');
    expect(urlDosTiles('http://aurora', null, CAMADAS_PADRAO)).not.toContain('competencia');
  });

  it('ajusta o raio do clique ao zoom, entre 5 e 200 metros', () => {
    expect(raioDoClique(10, -22.5)).toBe(200);
    expect(raioDoClique(17, -22.5)).toBe(15);
    expect(raioDoClique(22, -22.5)).toBe(5);
  });

  it('limita a área visível ao que a API aceita', () => {
    expect(areaVisivel(limites(-80.1234567, -22.7, -47.1, 10))).toEqual({
      oeste: -75, sul: -22.7, leste: -47.1, norte: 7,
    });
    expect(areaVisivel(limites(-47.39123456, -22.55, -47.38, -22.54)).oeste).toBe(-47.391235);
  });

  it('monta as coleções GeoJSON com id numérico nos municípios (destaque ao passar o mouse)', () => {
    const dados = {
      competencia: '2026-08', competencias: ['2026-08'], zoomImoveis: 15, zoomRede: 12, enquadramento: null,
      municipios: [{ unidadeId: 'm1', nome: 'Cidade A', codigoIbge: '3526902', adesao: 85.4, situacao: 'META_ATINGIDA',
        geometria: { type: 'Polygon', coordinates: [] } }],
      setores: [],
      operacionais: [{ unidadeId: 'e1', tipo: 'ETE', nome: 'ETE A', longitude: -47.4, latitude: -22.5 }],
    } as CamadasMapa;
    const c = colecoes(dados);
    expect(c.municipios.features[0]).toMatchObject({ id: 1, properties: { nome: 'Cidade A', situacao: 'META_ATINGIDA' } });
    expect(c.operacionais.features[0]!.geometry).toEqual({ type: 'Point', coordinates: [-47.4, -22.5] });
  });

  it('gera todas as camadas dos grupos do painel, com imóveis só a partir do zoom indicado', () => {
    const cores = new Proxy({}, { get: () => '#123456' }) as Record<string, string>;
    const camadas = camadasDaAurora(cores, true, 15, 12);
    const ids = camadas.map((c) => c.id);
    for (const id of Object.values(CAMADAS_DO_GRUPO).flat()) {
      expect(ids).toContain(id);
    }
    expect(camadas.find((c) => c.id === 'imoveis')).toMatchObject({ minzoom: 15, 'source-layer': 'imoveis' });
    expect(camadas.find((c) => c.id === 'agrupamentos')).toMatchObject({ maxzoom: 15 });
    expect(camadas.find((c) => c.id === 'rede-presumida')).toMatchObject({ minzoom: 12 });
  });

  it('mantém a atribuição do provedor do fundo', () => {
    const estilo = estiloBase({ tiles: ['https://t/{z}/{x}/{y}.png'], atribuicao: '© OSM', tamanho: 256, zoomMaximo: 19 }, false);
    expect(estilo.sources['fundo']).toMatchObject({ attribution: '© OSM', maxzoom: 19 });
  });
});
