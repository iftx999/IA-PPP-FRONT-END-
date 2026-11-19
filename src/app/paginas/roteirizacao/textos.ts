import type { MotivoSemRota, RotaDaEquipe, SituacaoRoteirizacao } from '../../api/tipos';
import type { Tom } from '../../ui/selo';

/** Roteirização (ADR 0046): textos e regras da tela, sem estado. */

export const ROTULO_SEM_ROTA: Record<MotivoSemRota, string> = {
  JORNADA: 'Não coube na jornada',
  HABILIDADE: 'Nenhuma equipe com a habilidade',
  VEICULO: 'Nenhuma equipe com o veículo',
  AREA: 'Fora da área das equipes',
  SEM_LOCAL: 'Sem localização no mapa',
};

export const ROTULO_SITUACAO: Record<SituacaoRoteirizacao, { texto: string; tom: Tom }> = {
  CALCULANDO: { texto: 'Calculando', tom: 'neutro' },
  PRONTA: { texto: 'Pronta para publicar', tom: 'ok' },
  FALHOU: { texto: 'Falhou', tom: 'perigo' },
  PUBLICADA: { texto: 'Publicada', tom: 'ok' },
  DESCARTADA: { texto: 'Descartada', tom: 'neutro' },
};

/** Tokens das cores das rotas, na ordem das equipes (repete depois da oitava). */
export const CORES_DAS_ROTAS = [
  '--rota-1',
  '--rota-2',
  '--rota-3',
  '--rota-4',
  '--rota-5',
  '--rota-6',
  '--rota-7',
  '--rota-8',
] as const;

export function corDaRota(indice: number): string {
  return CORES_DAS_ROTAS[indice % CORES_DAS_ROTAS.length]!;
}

/** "07:45" no fuso do navegador. */
export function hora(instante: string): string {
  return new Date(instante).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** 135 → "2 h 15 min"; 40 → "40 min". */
export function duracao(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (!h) {
    return `${m} min`;
  }
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** 3.456 → "3,5 km". */
export function km(valor: number): string {
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
}

/**
 * Ajustes do programador antes de recalcular (J6): OS fixadas por equipe. Fixar mantém a OS
 * na equipe; mover para outra equipe é fixá-la lá. As fixadas vão no começo da rota, na
 * ordem em que já estavam (as movidas, no fim, na ordem em que foram movidas).
 */
export interface Fixacao {
  equipeId: string;
  /** Ordem para o pedido: a posição atual na rota, ou depois de todas para as movidas. */
  posicao: number;
}

export type Fixacoes = ReadonlyMap<string, Fixacao>;

/** As já fixadas na roteirização, para começar o ajuste. */
export function fixacoesIniciais(rotas: readonly RotaDaEquipe[]): Map<string, Fixacao> {
  const mapa = new Map<string, Fixacao>();
  for (const rota of rotas) {
    for (const p of rota.paradas) {
      if (p.fixada) {
        mapa.set(p.ordemServicoId, { equipeId: rota.equipeId, posicao: p.ordem });
      }
    }
  }
  return mapa;
}

export function alternarFixacao(
  atual: Fixacoes,
  rotas: readonly RotaDaEquipe[],
  ordemServicoId: string,
): Map<string, Fixacao> {
  const novo = new Map(atual);
  if (novo.has(ordemServicoId)) {
    novo.delete(ordemServicoId);
    return novo;
  }
  for (const rota of rotas) {
    const parada = rota.paradas.find((p) => p.ordemServicoId === ordemServicoId);
    if (parada) {
      novo.set(ordemServicoId, { equipeId: rota.equipeId, posicao: parada.ordem });
    }
  }
  return novo;
}

export function moverPara(
  atual: Fixacoes,
  ordemServicoId: string,
  equipeId: string,
): Map<string, Fixacao> {
  const novo = new Map(atual);
  const ultima = Math.max(0, ...[...novo.values()].map((f) => f.posicao));
  novo.set(ordemServicoId, { equipeId, posicao: Math.max(10_000, ultima + 1) });
  return novo;
}

/** Corpo de `POST /roteirizacoes/{id}/recalcular`. */
export function pedidoDeRecalculo(fixacoes: Fixacoes): {
  fixadas: { equipeId: string; ordens: string[] }[];
} {
  const porEquipe = new Map<string, { os: string; posicao: number }[]>();
  for (const [os, f] of fixacoes) {
    const lista = porEquipe.get(f.equipeId) ?? [];
    lista.push({ os, posicao: f.posicao });
    porEquipe.set(f.equipeId, lista);
  }
  return {
    fixadas: [...porEquipe].map(([equipeId, lista]) => ({
      equipeId,
      ordens: lista.sort((a, b) => a.posicao - b.posicao).map((x) => x.os),
    })),
  };
}

/** As fixações diferem das que vieram na roteirização (há o que recalcular). */
export function mudou(inicial: Fixacoes, atual: Fixacoes): boolean {
  if (inicial.size !== atual.size) {
    return true;
  }
  for (const [os, f] of atual) {
    const antes = inicial.get(os);
    if (!antes || antes.equipeId !== f.equipeId) {
      return true;
    }
  }
  return false;
}
