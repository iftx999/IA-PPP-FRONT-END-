import type { SituacaoDocumento, StatusItem, TipoItem } from '../../api/tipos';
import type { Tom } from '../../ui/selo';

export const TIPOS_ITEM: Record<TipoItem, { rotulo: string; icone: string }> = {
  META: { rotulo: 'Meta', icone: 'flag' },
  INDICADOR: { rotulo: 'Indicador', icone: 'monitoring' },
  OBRIGACAO: { rotulo: 'Obrigação', icone: 'assignment' },
  PRAZO: { rotulo: 'Prazo', icone: 'event' },
  PENALIDADE: { rotulo: 'Penalidade', icone: 'gavel' },
  REAJUSTE: { rotulo: 'Reajuste', icone: 'trending_up' },
  RISCO: { rotulo: 'Risco', icone: 'warning' },
  OUTRO: { rotulo: 'Outro', icone: 'description' },
};

export const STATUS_ITEM: Record<StatusItem, { rotulo: string; tom: Tom }> = {
  PROPOSTO: { rotulo: 'Para revisar', tom: 'atencao' },
  APROVADO: { rotulo: 'Aprovado', tom: 'ok' },
  REJEITADO: { rotulo: 'Rejeitado', tom: 'neutro' },
  SUBSTITUIDO: { rotulo: 'Substituído', tom: 'neutro' },
};

export const SITUACOES_DOCUMENTO: Record<SituacaoDocumento, { rotulo: string; tom: Tom; andamento: boolean }> = {
  RECEBIDO: { rotulo: 'Na fila', tom: 'neutro', andamento: true },
  RECONHECENDO_TEXTO: { rotulo: 'Lendo o texto', tom: 'neutro', andamento: true },
  PROCESSANDO: { rotulo: 'IA analisando', tom: 'neutro', andamento: true },
  PRONTO: { rotulo: 'Pronto', tom: 'ok', andamento: false },
  SEM_TEXTO: { rotulo: 'Sem texto', tom: 'atencao', andamento: false },
  FALHA: { rotulo: 'Falhou', tom: 'perigo', andamento: false },
};

/** "cl. 7.2 · p. 2", ou só a página quando falta a cláusula. */
export function referencia(clausula: string | null | undefined, pagina: number): string {
  return clausula ? `cl. ${clausula} · p. ${pagina}` : `p. ${pagina}`;
}
