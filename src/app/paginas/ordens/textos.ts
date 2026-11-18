import type {
  AcaoDeCampo,
  EventoDaOrdem,
  ParametroDaExecucao,
  Prioridade,
  ServicoParaOrdem,
  TipoConflito,
} from '../../api/tipos';
import type { Tom } from '../../ui/selo';

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

// ----- Execução de campo (ADR 0045) -----

export const ROTULO_ACAO: Record<AcaoDeCampo, { texto: string; icone: string }> = {
  INICIAR: { texto: 'Iniciou', icone: 'play_arrow' },
  PARALISAR: { texto: 'Paralisou', icone: 'pause' },
  RETOMAR: { texto: 'Retomou', icone: 'resume' },
  DEVOLVER: { texto: 'Devolveu', icone: 'undo' },
  ENCERRAR: { texto: 'Encerrou', icone: 'task_alt' },
};

/** O que o servidor fez com o evento (RN-26); aplicado não leva selo. */
export const ROTULO_SITUACAO_EVENTO: Record<string, { texto: string; tom: Tom }> = {
  APLICADO: { texto: 'Aplicado', tom: 'ok' },
  CONFLITO: { texto: 'Conflito', tom: 'perigo' },
  SUPERADO: { texto: 'Não aplicado: a programação mudou', tom: 'neutro' },
  AGUARDANDO: { texto: 'Aguardando evento anterior', tom: 'atencao' },
  REJEITADO: { texto: 'Recusado', tom: 'perigo' },
};

export const ROTULO_AVISO: Record<string, string> = {
  RELOGIO: 'Relógio do celular diferente do servidor',
  FORA_DO_LOCAL: 'Início longe do local',
  SEM_GPS: 'Sem GPS',
  SEM_JORNADA: 'Fora da jornada',
  EXECUCAO_SIMULTANEA: 'Equipe com outra OS em execução',
  APARELHO_REVOGADO: 'Enviado por celular bloqueado',
};

export const ROTULO_CONFLITO: Record<TipoConflito, string> = {
  OS_CANCELADA: 'OS cancelada',
  OUTRA_EQUIPE: 'OS com outra equipe',
  JA_ENCERRADA: 'OS já encerrada',
};

/** Encerramento que vale: o último aplicado (ou em conflito) com valores. */
export function encerramentoComValores(
  eventos: readonly EventoDaOrdem[],
): EventoDaOrdem | undefined {
  return [...eventos]
    .reverse()
    .find(
      (e) =>
        e.tipo === 'ENCERRAR' &&
        (e.situacao === 'APLICADO' || e.situacao === 'CONFLITO') &&
        e.valores != null,
    );
}

/** Valor de um parâmetro em texto (fotos à parte). */
export function valorDoParametro(p: ParametroDaExecucao, valor: unknown): string {
  if (valor == null || valor === '') {
    return '—';
  }
  switch (p.tipo) {
    case 'SIM_NAO':
      return valor === true ? 'Sim' : 'Não';
    case 'LISTA_MULTIPLA':
      return Array.isArray(valor) ? valor.join(', ') : String(valor);
    case 'FOTO':
      return Array.isArray(valor)
        ? `${valor.length} ${valor.length === 1 ? 'foto' : 'fotos'}`
        : '—';
    case 'DATA_HORA':
      return new Date(String(valor)).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    case 'INTEIRO':
    case 'DECIMAL':
      return (
        Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) +
        (p.unidade ? ` ${p.unidade}` : '')
      );
    default:
      return String(valor);
  }
}

/** Distância em texto: metros até 1 km, depois km. */
export function distancia(metros: number | null | undefined): string {
  if (metros == null) {
    return '';
  }
  return metros < 1000
    ? `${Math.round(metros).toLocaleString('pt-BR')} m`
    : `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}
