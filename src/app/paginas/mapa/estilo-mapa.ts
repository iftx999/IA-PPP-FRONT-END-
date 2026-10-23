import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  LngLatBounds,
  StyleSpecification,
} from 'maplibre-gl';
import type { Geometry } from 'geojson';
import type { AreaMapa, CamadasMapa, Situacao, SituacaoNoMapa } from '../../api/tipos';
import type { FundoDoMapa } from '../../nucleo/fundo-mapa';

/**
 * Estilo do mapa (doc 07, seção 7.6) gerado a partir dos tokens de cor do tema, para o mapa seguir o claro/escuro.
 * Funções puras: o componente só aplica o resultado.
 */

export const SITUACOES: { codigo: SituacaoNoMapa; rotulo: string; token: string }[] = [
  { codigo: 'LIGADO', rotulo: 'Ligado', token: '--ok' },
  { codigo: 'FACTIVEL', rotulo: 'Factível sem ligação', token: '--warn' },
  { codigo: 'CORTADO', rotulo: 'Cortado', token: '--danger' },
  { codigo: 'SEM_REDE', rotulo: 'Sem rede', token: '--neutral' },
];

export const SITUACOES_MUNICIPIO: { codigo: Situacao; rotulo: string; token: string }[] = [
  { codigo: 'META_ATINGIDA', rotulo: 'Meta atingida', token: '--ok' },
  { codigo: 'ATENCAO', rotulo: 'Atenção', token: '--warn' },
  { codigo: 'ABAIXO_DO_ALERTA', rotulo: 'Abaixo do alerta', token: '--danger' },
  { codigo: 'SEM_META', rotulo: 'Sem meta', token: '--neutral' },
];

/** Preenchimento dos municípios no tema escuro (doc 07): tons fechados que não ofuscam o fundo. */
const PREENCHIMENTO_ESCURO: Record<Situacao, string> = {
  META_ATINGIDA: '#267456',
  ATENCAO: '#736423',
  ABAIXO_DO_ALERTA: '#6e3544',
  SEM_META: '#2e3f46',
};

/** Limites aceitos pela API (entorno do Brasil). */
export const LIMITES_BRASIL: AreaMapa = { oeste: -75, sul: -35, leste: -28, norte: 7 };

export type Cores = Record<string, string>;

export interface Camadas {
  municipios: boolean;
  setores: boolean;
  rede: boolean;
  imoveis: boolean;
  situacoes: SituacaoNoMapa[];
  aproximadas: boolean;
  marcacoes: boolean;
  operacionais: boolean;
}

export const CAMADAS_PADRAO: Camadas = {
  municipios: true,
  setores: true,
  rede: true,
  imoveis: true,
  situacoes: ['LIGADO', 'FACTIVEL', 'CORTADO', 'SEM_REDE'],
  aproximadas: true,
  marcacoes: true,
  operacionais: true,
};

const TOKENS = ['--ok', '--warn', '--danger', '--neutral', '--net-confirmed', '--net-presumed', '--accent',
  '--accent-2', '--on-accent', '--bg-0', '--bg-2', '--text-1', '--text-3', '--line'];

/** Lê os tokens de cor do tema atual. */
export function lerCores(raiz: HTMLElement = document.documentElement): Cores {
  const estilo = getComputedStyle(raiz);
  return Object.fromEntries(TOKENS.map((t) => [t, estilo.getPropertyValue(t).trim() || '#888888']));
}

/** URL dos tiles com a competência e as camadas ligadas (mudou o filtro, mudou a URL: o cache não mistura). */
export function urlDosTiles(origem: string, competencia: string | null, camadas: Camadas): string {
  const params = new URLSearchParams();
  if (competencia) {
    params.set('competencia', competencia);
  }
  for (const situacao of camadas.situacoes) {
    params.append('situacoes', situacao);
  }
  params.set('aproximadas', String(camadas.aproximadas));
  params.set('rede', String(camadas.rede));
  return `${origem}/api/v1/mapa/tiles/{z}/{x}/{y}.mvt?${params.toString()}`;
}

/** Raio do clique em metros: ~14 px no zoom atual, entre 5 e 200 m. */
export function raioDoClique(zoom: number, latitude: number): number {
  const metrosPorPixel = (156_543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  return Math.round(Math.min(200, Math.max(5, metrosPorPixel * 14)));
}

/** Área visível limitada ao que a API aceita, com 6 casas (o que vai para a auditoria). */
export function areaVisivel(limites: LngLatBounds): AreaMapa {
  const arredondar = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    oeste: arredondar(Math.max(LIMITES_BRASIL.oeste, limites.getWest())),
    sul: arredondar(Math.max(LIMITES_BRASIL.sul, limites.getSouth())),
    leste: arredondar(Math.min(LIMITES_BRASIL.leste, limites.getEast())),
    norte: arredondar(Math.min(LIMITES_BRASIL.norte, limites.getNorth())),
  };
}

/** Rótulo curto do agrupamento: 12, 980, "1,2 mil", "15 mil". */
export function rotuloQuantidade(quantidade: number): string {
  if (quantidade < 1000) {
    return String(quantidade);
  }
  if (quantidade < 10_000) {
    const decimal = Math.floor(quantidade / 100) % 10;
    return `${Math.floor(quantidade / 1000)}${decimal ? `,${decimal}` : ''} mil`;
  }
  return `${Math.floor(quantidade / 1000)} mil`;
}

/** Mesmo rótulo como expressão do MapLibre (nome da imagem do agrupamento, desenhada sob demanda). */
const ROTULO_AGRUPAMENTO: ExpressionSpecification = [
  'let', 'q', ['get', 'quantidade'],
  ['case',
    ['<', ['var', 'q'], 1000], ['to-string', ['var', 'q']],
    ['<', ['var', 'q'], 10000],
    ['concat', ['to-string', ['floor', ['/', ['var', 'q'], 1000]]],
      ['case', ['==', ['%', ['floor', ['/', ['var', 'q'], 100]], 10], 0], '',
        ['concat', ',', ['to-string', ['%', ['floor', ['/', ['var', 'q'], 100]], 10]]]],
      ' mil'],
    ['concat', ['to-string', ['floor', ['/', ['var', 'q'], 1000]]], ' mil']],
];

export const PREFIXO_AGRUPAMENTO = 'grupo:';

export function estiloBase(fundo: FundoDoMapa, escuro: boolean): StyleSpecification {
  return {
    version: 8,
    sources: {
      fundo: {
        type: 'raster',
        tiles: fundo.tiles,
        tileSize: fundo.tamanho,
        maxzoom: fundo.zoomMaximo,
        attribution: fundo.atribuicao,
      },
    },
    layers: [{ id: 'fundo', type: 'raster', source: 'fundo', paint: pinturaDoFundo(escuro) }],
  };
}

/** OpenStreetMap escurecido e dessaturado no tema escuro ("vias discretas"); suave no claro. */
export function pinturaDoFundo(escuro: boolean): Record<string, number> {
  return escuro
    ? { 'raster-saturation': -0.85, 'raster-brightness-max': 0.36, 'raster-contrast': 0.12 }
    : { 'raster-saturation': -0.45, 'raster-brightness-max': 1, 'raster-contrast': 0 };
}

const corPorSituacao = (cores: Cores): ExpressionSpecification => [
  'match', ['get', 'situacao'],
  ...SITUACOES.flatMap((s) => [s.codigo, cores[s.token]!]),
  cores['--neutral']!,
] as unknown as ExpressionSpecification;

const corPorSituacaoMunicipio = (cores: Cores, preenchimento: boolean, escuro: boolean): ExpressionSpecification => [
  'match', ['get', 'situacao'],
  ...SITUACOES_MUNICIPIO.flatMap((s) => [
    s.codigo, preenchimento && escuro ? PREENCHIMENTO_ESCURO[s.codigo] : cores[s.token]!,
  ]),
  cores['--neutral']!,
] as unknown as ExpressionSpecification;

/** Camadas da Aurora, de baixo para cima. */
export function camadasDaAurora(cores: Cores, escuro: boolean, zoomImoveis: number, zoomRede: number): LayerSpecification[] {
  const presumida: FilterSpecification = ['==', ['get', 'situacao'], 'PRESUMIDA'];
  return [
    {
      id: 'municipios-preenchimento', type: 'fill', source: 'municipios',
      paint: {
        'fill-color': corPorSituacaoMunicipio(cores, true, escuro),
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, escuro ? 0.62 : 0.3, 14, escuro ? 0.18 : 0.08],
      },
    },
    {
      id: 'municipios-contorno', type: 'line', source: 'municipios',
      paint: {
        'line-color': ['case', ['boolean', ['feature-state', 'destaque'], false], cores['--accent']!,
          corPorSituacaoMunicipio(cores, false, escuro)],
        'line-width': ['case', ['boolean', ['feature-state', 'destaque'], false], 3, 1.5],
      },
    },
    {
      id: 'setores-contorno', type: 'line', source: 'setores', minzoom: 10,
      paint: { 'line-color': cores['--text-3']!, 'line-width': 1, 'line-dasharray': [3, 2] },
    },
    {
      id: 'rede-confirmada', type: 'line', source: 'aurora', 'source-layer': 'rede', minzoom: zoomRede,
      filter: ['!', presumida],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': cores['--net-confirmed']!, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 17, 3] },
    },
    {
      id: 'rede-presumida', type: 'line', source: 'aurora', 'source-layer': 'rede', minzoom: zoomRede,
      filter: presumida,
      paint: {
        'line-color': cores['--net-presumed']!,
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 17, 3],
        'line-dasharray': [2, 1.5],
      },
    },
    {
      id: 'agrupamentos', type: 'symbol', source: 'aurora', 'source-layer': 'agrupamentos', maxzoom: zoomImoveis,
      layout: {
        'icon-image': ['concat', PREFIXO_AGRUPAMENTO, ROTULO_AGRUPAMENTO],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['-', 0, ['get', 'quantidade']],
      },
    },
    {
      id: 'imoveis', type: 'symbol', source: 'aurora', 'source-layer': 'imoveis', minzoom: zoomImoveis,
      layout: {
        'icon-image': ['case', ['get', 'aproximada'], 'casa-aproximada', 'casa'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], zoomImoveis, 0.55, 18, 1],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-color': corPorSituacao(cores), 'icon-halo-color': cores['--bg-0']!, 'icon-halo-width': 1 },
    },
    {
      id: 'operacionais', type: 'symbol', source: 'operacionais',
      layout: { 'icon-image': 'estacao', 'icon-allow-overlap': true, 'icon-size': 0.9 },
    },
    {
      id: 'marcacoes', type: 'symbol', source: 'marcacoes',
      layout: { 'icon-image': 'pino', 'icon-anchor': 'bottom', 'icon-allow-overlap': true },
    },
    {
      id: 'selecao', type: 'circle', source: 'selecao',
      paint: {
        'circle-radius': 14, 'circle-color': 'transparent',
        'circle-stroke-color': cores['--accent']!, 'circle-stroke-width': 2.5,
      },
    },
  ];
}

/** Camadas do MapLibre de cada grupo do painel (para ligar e desligar). */
export const CAMADAS_DO_GRUPO: Record<'municipios' | 'setores' | 'rede' | 'imoveis' | 'marcacoes' | 'operacionais', string[]> = {
  municipios: ['municipios-preenchimento', 'municipios-contorno'],
  setores: ['setores-contorno'],
  rede: ['rede-confirmada', 'rede-presumida'],
  imoveis: ['agrupamentos', 'imoveis'],
  marcacoes: ['marcacoes'],
  operacionais: ['operacionais'],
};

/** GeoJSON das camadas leves; o id numérico do município permite o destaque por feature-state. */
export function colecoes(dados: CamadasMapa) {
  return {
    municipios: {
      type: 'FeatureCollection' as const,
      features: dados.municipios.map((m, i) => ({
        type: 'Feature' as const, id: i + 1,
        geometry: m.geometria as unknown as Geometry,
        properties: { unidadeId: m.unidadeId, nome: m.nome, situacao: m.situacao, adesao: m.adesao },
      })),
    },
    setores: {
      type: 'FeatureCollection' as const,
      features: dados.setores.map((s) => ({
        type: 'Feature' as const,
        geometry: s.geometria as unknown as Geometry,
        properties: { unidadeId: s.unidadeId, nome: s.nome },
      })),
    },
    operacionais: {
      type: 'FeatureCollection' as const,
      features: dados.operacionais.map((o) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [o.longitude, o.latitude] },
        properties: { unidadeId: o.unidadeId, nome: o.nome, tipo: o.tipo },
      })),
    },
  };
}

// ----- Ícones (desenhados em canvas: sem depender de sprites nem de fontes externas) -----

export interface Icone {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function desenhar(lado: [number, number], pintar: (c: CanvasRenderingContext2D) => void, escala = 2): Icone {
  const canvas = document.createElement('canvas');
  canvas.width = lado[0] * escala;
  canvas.height = lado[1] * escala;
  const c = canvas.getContext('2d')!;
  c.scale(escala, escala);
  pintar(c);
  return { width: canvas.width, height: canvas.height, data: c.getImageData(0, 0, canvas.width, canvas.height).data };
}

function contornoDaCasa(c: CanvasRenderingContext2D): void {
  c.beginPath();
  c.moveTo(12, 3);
  c.lineTo(21, 11);
  c.lineTo(18.5, 11);
  c.lineTo(18.5, 20);
  c.lineTo(5.5, 20);
  c.lineTo(5.5, 11);
  c.lineTo(3, 11);
  c.closePath();
}

/** Casa cheia (SDF: a cor vem da situação). */
export function iconeCasa(): Icone {
  return desenhar([24, 24], (c) => {
    contornoDaCasa(c);
    c.fillStyle = '#000';
    c.fill();
  });
}

/** Casa de localização aproximada: contorno pontilhado e miolo vazado (doc 07). */
export function iconeCasaAproximada(): Icone {
  return desenhar([24, 24], (c) => {
    contornoDaCasa(c);
    c.strokeStyle = '#000';
    c.lineWidth = 2.2;
    c.setLineDash([2.4, 2]);
    c.stroke();
    c.beginPath();
    c.arc(12, 14.5, 2, 0, Math.PI * 2);
    c.fillStyle = '#000';
    c.fill();
  });
}

/** Pino da marcação de visita, na cor de destaque. */
export function iconePino(cores: Cores): Icone {
  return desenhar([28, 36], (c) => {
    c.beginPath();
    c.moveTo(14, 35);
    c.bezierCurveTo(4, 22, 2, 18, 2, 13);
    c.arc(14, 13, 12, Math.PI, 0);
    c.bezierCurveTo(26, 18, 24, 22, 14, 35);
    c.fillStyle = cores['--accent']!;
    c.strokeStyle = cores['--bg-0']!;
    c.lineWidth = 2;
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(14, 13, 4.5, 0, Math.PI * 2);
    c.fillStyle = cores['--bg-0']!;
    c.fill();
  });
}

/** ETE/EEE: marcador ciano (doc 07) com gota estilizada. */
export function iconeEstacao(cores: Cores): Icone {
  return desenhar([26, 26], (c) => {
    c.beginPath();
    c.roundRect(2, 2, 22, 22, 6);
    c.fillStyle = cores['--accent-2']!;
    c.strokeStyle = cores['--bg-0']!;
    c.lineWidth = 2;
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(13, 6.5);
    c.bezierCurveTo(9, 12, 8, 14, 8, 15.5);
    c.arc(13, 15.5, 5, Math.PI, 0, true);
    c.bezierCurveTo(18, 14, 17, 12, 13, 6.5);
    c.fillStyle = cores['--bg-0']!;
    c.fill();
  });
}

/** Agrupamento: círculo com a contagem; o diâmetro acompanha a largura do texto. */
export function iconeAgrupamento(rotulo: string, cores: Cores, fonte: string): Icone {
  const tipo = `600 11px ${fonte}`;
  const medida = document.createElement('canvas').getContext('2d')!;
  medida.font = tipo;
  const lado = Math.ceil(Math.max(30, medida.measureText(rotulo).width + 22));
  return desenhar([lado, lado], (c) => {
    const centro = lado / 2;
    c.beginPath();
    c.arc(centro, centro, centro - 1.5, 0, Math.PI * 2);
    c.fillStyle = cores['--accent-2']!;
    c.globalAlpha = 0.28;
    c.fill();
    c.globalAlpha = 1;
    c.lineWidth = 2;
    c.strokeStyle = cores['--accent-2']!;
    c.stroke();
    c.beginPath();
    c.arc(centro, centro, centro - 6, 0, Math.PI * 2);
    c.fillStyle = cores['--bg-2']!;
    c.fill();
    c.fillStyle = cores['--text-1']!;
    c.font = tipo;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(rotulo, centro, centro + 0.5);
  });
}
