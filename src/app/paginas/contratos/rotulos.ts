import type { ItemContratual, SituacaoDocumento, StatusItem, TipoItem } from '../../api/tipos';
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

/**
 * Situação de um prazo aprovado (ADR 0024), com as mesmas faixas do alerta: até 60 dias
 * em atenção, 15 dias ou vencido em perigo. Nulo para os demais itens.
 */
export function situacaoDoPrazo(
  item: Pick<ItemContratual, 'tipo' | 'status' | 'dataLimite' | 'cumpridoEm'>,
  hoje = new Date(),
): { rotulo: string; tom: Tom } | null {
  if (item.tipo !== 'PRAZO' || item.status !== 'APROVADO' || !item.dataLimite) {
    return null;
  }
  if (item.cumpridoEm) {
    return { rotulo: 'Cumprido', tom: 'ok' };
  }
  const [ano, mes, dia] = item.dataLimite.split('-').map(Number);
  const inicioDoDia = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.round((Date.UTC(ano!, mes! - 1, dia!) - inicioDoDia) / 86_400_000);
  if (dias < 0) {
    return { rotulo: dias === -1 ? 'Venceu há 1 dia' : `Venceu há ${-dias} dias`, tom: 'perigo' };
  }
  if (dias === 0) {
    return { rotulo: 'Vence hoje', tom: 'perigo' };
  }
  if (dias <= 60) {
    return { rotulo: dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias`, tom: dias <= 15 ? 'perigo' : 'atencao' };
  }
  return null;
}
