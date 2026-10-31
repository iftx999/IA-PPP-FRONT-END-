import type { ItemContratual, Recorrencia, SituacaoDocumento, StatusItem, TipoItem } from '../../api/tipos';
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

/** Repetição de prazos e obrigações (ADR 0026), em meses. */
export const RECORRENCIAS: Record<Recorrencia, { rotulo: string; meses: number }> = {
  MENSAL: { rotulo: 'Mensal', meses: 1 },
  BIMESTRAL: { rotulo: 'Bimestral', meses: 2 },
  TRIMESTRAL: { rotulo: 'Trimestral', meses: 3 },
  QUADRIMESTRAL: { rotulo: 'Quadrimestral', meses: 4 },
  SEMESTRAL: { rotulo: 'Semestral', meses: 6 },
  ANUAL: { rotulo: 'Anual', meses: 12 },
  QUADRIENAL: { rotulo: 'A cada 4 anos', meses: 48 },
  QUINQUENAL: { rotulo: 'A cada 5 anos', meses: 60 },
};

/** Prazos e obrigações têm vencimento a cumprir depois de aprovados. */
export function temVencimento(item: Pick<ItemContratual, 'tipo' | 'status'>): boolean {
  return item.status === 'APROVADO' && (item.tipo === 'PRAZO' || item.tipo === 'OBRIGACAO');
}

/** Dias da data (aaaa-mm-dd) em relação a hoje, no calendário local. */
export function diasAte(dataIso: string, hoje = new Date()): number {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const inicioDoDia = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((Date.UTC(ano!, mes! - 1, dia!) - inicioDoDia) / 86_400_000);
}

/**
 * Situação do próximo vencimento de um prazo ou obrigação aprovado, com as mesmas faixas do alerta
 * (ADR 0024, ADR 0026): até 60 dias em atenção e 15 em perigo; em item recorrente, no máximo metade e um
 * quarto do período. Nulo sem agenda ou fora da antecedência.
 */
export function situacaoDoPrazo(
  item: Pick<ItemContratual, 'agenda'>,
  hoje = new Date(),
): { rotulo: string; tom: Tom } | null {
  const agenda = item.agenda;
  if (!agenda) {
    return null;
  }
  if (!agenda.proximoVencimento) {
    return { rotulo: 'Cumprido', tom: 'ok' };
  }
  const periodo = agenda.recorrencia ? RECORRENCIAS[agenda.recorrencia].meses * 30 : Infinity;
  const antecedencia = Math.min(60, Math.floor(periodo / 2));
  const critico = Math.min(15, Math.floor(periodo / 4));
  const dias = diasAte(agenda.proximoVencimento, hoje);
  if (dias < 0) {
    return { rotulo: dias === -1 ? 'Venceu há 1 dia' : `Venceu há ${-dias} dias`, tom: 'perigo' };
  }
  if (dias === 0) {
    return { rotulo: 'Vence hoje', tom: 'perigo' };
  }
  if (dias <= antecedencia) {
    return { rotulo: dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias`, tom: dias <= critico ? 'perigo' : 'atencao' };
  }
  return null;
}
