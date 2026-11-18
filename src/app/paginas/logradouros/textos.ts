import type { FeatureCollection, LineString } from 'geojson';
import type { CoberturaEnderecos, LadoTrecho, TrechoLogradouro } from '../../api/tipos';
import { numero, percentual } from '../../nucleo/formato';

/** Rótulos e utilitários da tela de logradouros (ADR 0043). */
export const ROTULO_LADO: Record<LadoTrecho, string> = {
  AMBOS: 'Os dois lados',
  PAR: 'Lado par',
  IMPAR: 'Lado ímpar',
};

export const ROTULO_PRECISAO: Record<string, string> = {
  ENDERECO: 'No endereço',
  LOGRADOURO: 'Aproximada (rua)',
  BAIRRO: 'Aproximada (bairro)',
  MANUAL: 'Marcada à mão',
};

/** "Rua" + "das Flores" → "Rua das Flores"; sem repetir quando o nome já começa pelo tipo ("Rua Rua das Flores"). */
export function nomeCompleto(l: { tipo: string | null; nome: string }): string {
  if (!l.tipo || l.nome.toLowerCase().startsWith(l.tipo.toLowerCase() + ' ')) {
    return l.nome;
  }
  return `${l.tipo} ${l.nome}`;
}

/** "1 a 99 · lado ímpar", "sem numeração". */
export function faixaDoTrecho(
  t: Pick<TrechoLogradouro, 'numeroInicial' | 'numeroFinal' | 'lado'>,
): string {
  const { numeroInicial: ini, numeroFinal: fim } = t;
  const faixa =
    ini != null && fim != null
      ? `${numero(ini)} a ${numero(fim)}`
      : ini != null
        ? `a partir de ${numero(ini)}`
        : fim != null
          ? `até ${numero(fim)}`
          : 'sem numeração';
  return t.lado === 'AMBOS' ? faixa : `${faixa} · ${ROTULO_LADO[t.lado].toLowerCase()}`;
}

const UMA_CASA = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** "1,2 km" ou "350 m". */
export function extensao(metros: number): string {
  return metros >= 1000
    ? `${UMA_CASA.format(metros / 1000)} km`
    : `${numero(Math.round(metros))} m`;
}

/** Quanto do cadastro já serve ao campo, em frases para os indicadores da tela. */
export function indicadoresDaCobertura(
  c: CoberturaEnderecos,
): { rotulo: string; valor: string; detalhe: string }[] {
  const parte = (n: number) => (c.imoveis ? percentual((n / c.imoveis) * 100) : '—');
  return [
    {
      rotulo: 'Com endereço',
      valor: parte(c.comEndereco),
      detalhe: `${numero(c.comEndereco)} de ${numero(c.imoveis)} imóveis`,
    },
    {
      rotulo: 'Com trecho',
      valor: parte(c.comTrecho),
      detalhe: `${numero(c.comTrecho)} imóveis prontos para a rota`,
    },
    {
      rotulo: 'Localização aproximada',
      valor: parte(c.aproximados),
      detalhe: `${numero(c.aproximados)} sem ponto exato no mapa`,
    },
  ];
}

/** Trechos como GeoJSON para o mapa, com o código e a faixa em cada linha. */
export function colecaoDosTrechos(
  trechos: readonly TrechoLogradouro[],
): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: trechos.map((t) => ({
      type: 'Feature',
      id: t.id,
      properties: { id: t.id, codigo: t.codigo, faixa: faixaDoTrecho(t) },
      geometry: { type: 'LineString', coordinates: t.coordenadas.map((p) => [p[0]!, p[1]!]) },
    })),
  };
}

/** Retângulo que contém todos os trechos ([oeste, sul, leste, norte]); nulo sem pontos. */
export function enquadramento(
  trechos: readonly TrechoLogradouro[],
): [number, number, number, number] | null {
  const pontos = trechos.flatMap((t) => t.coordenadas);
  if (!pontos.length) {
    return null;
  }
  const lons = pontos.map((p) => p[0]!);
  const lats = pontos.map((p) => p[1]!);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export const MODELO_ENDERECOS =
  'matricula;codigo_logradouro;numero;complemento\n2001002;101;15;Casa 2\n2001003;101;S/N;\n';

export const MODELO_TRECHOS = JSON.stringify(
  {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          codigo_logradouro: '101',
          tipo: 'Rua',
          nome: 'Rua São João',
          bairro: 'Centro',
          codigo_trecho: '101-1',
          numero_inicial: 1,
          numero_final: 99,
          lado: 'IMPAR',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-47.06, -22.9],
            [-47.055, -22.9],
          ],
        },
      },
    ],
  },
  null,
  2,
);
