import type { Prioridade, ServicoParaOrdem } from '../../api/tipos';

/** Programação das OS (ADR 0044). */
export type ModoNovaOrdem = 'IMOVEIS' | 'TRECHOS' | 'LOTE';

export const MODOS_NOVA_ORDEM: Record<ModoNovaOrdem, { titulo: string; descricao: string }> = {
  IMOVEIS: {
    titulo: 'Imóveis',
    descricao: 'Uma OS para cada matrícula informada.',
  },
  TRECHOS: {
    titulo: 'Trechos de rede',
    descricao: 'Uma OS por trecho do logradouro (limpeza, desobstrução, reparo).',
  },
  LOTE: {
    titulo: 'Lote por logradouro',
    descricao: 'Uma OS para cada imóvel da rua ou da faixa, na ordem da numeração.',
  },
};

/** Serviços que aceitam o alvo do modo (lote e imóveis: imóvel; trechos: trecho). */
export function servicosPara(
  servicos: readonly ServicoParaOrdem[],
  modo: ModoNovaOrdem,
): ServicoParaOrdem[] {
  const alvo = modo === 'TRECHOS' ? 'TRECHO' : 'IMOVEL';
  return servicos.filter((s) => s.alvo === alvo || s.alvo === 'AMBOS');
}

/** Matrículas separadas por linha, vírgula, ponto e vírgula ou espaço, sem repetidas. */
export function matriculasDoTexto(texto: string): string[] {
  return [
    ...new Set(
      texto
        .split(/[\s,;]+/)
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  ];
}

/** RN-21 em palavras: emergencial em horas corridas, as demais em dias úteis. */
export function prazoDoServico(s: ServicoParaOrdem, prioridade: Prioridade): string {
  if (prioridade === 'EMERGENCIAL') {
    return `${s.prazoEmergencialHoras} h corridas`;
  }
  const dias = { ALTA: s.prazoAltaDias, MEDIA: s.prazoMediaDias, BAIXA: s.prazoBaixaDias }[
    prioridade
  ];
  return `${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'}`;
}
