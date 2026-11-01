import type { CenarioSimulado, RegraSimulada, Simulacao } from '../../api/tipos';
import type { Tom } from '../../ui/selo';
import { competenciaCurta, numero, percentual } from '../../nucleo/formato';

const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const reaisCompacto = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1,
});
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });

/** 10000 → "R$ 10.000,00". */
export function moeda(valor: number | null | undefined): string {
  return valor == null ? '—' : reais.format(valor);
}

/** 1250000 → "R$ 1,3 mi" (eixos e selos). */
export function moedaCompacta(valor: number): string {
  return reaisCompacto.format(valor);
}

/** Como a regra calcula, em uma frase (ex.: "0,1% de R$ 10.000.000,00 (faturamento mensal) por ponto ou fração"). */
export function descreverRegra(r: Pick<RegraSimulada, 'formula' | 'valor' | 'baseValor' | 'baseDescricao' | 'contagem' | 'periodicidade' | 'teto'>): string {
  const ponto = r.contagem === 'POR_PONTO_OU_FRACAO' ? 'por ponto percentual ou fração' : 'por ponto percentual (proporcional)';
  const periodo = r.periodicidade === 'MENSAL' ? 'a cada mês abaixo da meta' : 'a cada 12 meses abaixo da meta';
  let formula: string;
  switch (r.formula) {
    case 'PERCENTUAL_DA_BASE_POR_PONTO':
      formula = `${decimal.format(r.valor)}% de ${moeda(r.baseValor)}${r.baseDescricao ? ` (${r.baseDescricao.toLowerCase()})` : ''} ${ponto}`;
      break;
    case 'VALOR_POR_PONTO':
      formula = `${moeda(r.valor)} ${ponto}`;
      break;
    default:
      formula = moeda(r.valor);
  }
  return `${formula}, ${periodo}${r.teto != null ? `, até ${moeda(r.teto)} por aferição` : ''}.`;
}

/** Frase principal de um cenário. */
export function veredito(s: Simulacao, c: CenarioSimulado): string {
  const meta = s.meta;
  if (!meta) {
    return 'Sem meta aplicável: a projeção mostra só a adesão.';
  }
  const ritmo = `${numero(c.ligacoesPorMes)} ligações por mês`;
  if (meta.prazo == null) {
    return c.mesAtingimento
      ? `Com ${ritmo}, a meta de ${percentual(meta.valor)} sai em ${competenciaCurta(c.mesAtingimento)}.`
      : `Com ${ritmo}, a meta de ${percentual(meta.valor)} não sai até ${competenciaCurta(s.fim)}.`;
  }
  if (c.adesaoNoPrazo != null && c.adesaoNoPrazo >= meta.valor) {
    return `Com ${ritmo}, a meta de ${percentual(meta.valor)} sai até o prazo (${competenciaCurta(meta.prazo)}).`;
  }
  const noPrazo = c.adesaoNoPrazo != null ? `: ${percentual(c.adesaoNoPrazo)} no prazo` : '';
  return c.mesAtingimento
    ? `Com ${ritmo}, a meta fica para ${competenciaCurta(c.mesAtingimento)}, depois do prazo${noPrazo}.`
    : `Com ${ritmo}, a meta não sai até ${competenciaCurta(s.fim)}${noPrazo}.`;
}

/** Diferença de multa do cenário em relação ao ritmo atual. */
export function comparacao(s: Simulacao): { tom: Tom; texto: string } {
  const diferenca = s.ritmoAtualProjetado.multaTotal - s.cenario.multaTotal;
  if (Math.abs(diferenca) < 0.005) {
    return { tom: 'neutro', texto: 'Mesma multa estimada do ritmo atual.' };
  }
  return diferenca > 0
    ? { tom: 'ok', texto: `${moeda(diferenca)} a menos que no ritmo atual.` }
    : { tom: 'perigo', texto: `${moeda(-diferenca)} a mais que no ritmo atual.` };
}
