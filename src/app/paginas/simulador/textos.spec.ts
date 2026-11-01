import type { Simulacao } from '../../api/tipos';
import { comparacao, descreverRegra, moeda as moedaComNbsp, veredito } from './textos';

/** O Intl separa "R$" do número com espaço não separável. */
const comum = (texto: string) => texto.replace(/\u00a0/g, ' ');
const moeda = (valor: number | null) => comum(moedaComNbsp(valor));

const cenario = (ligacoesPorMes: number, multaTotal: number, adesaoNoPrazo: number | null, mesAtingimento: string | null) => ({
  ligacoesPorMes, multaTotal, adesaoNoPrazo, mesAtingimento, meses: [],
});

function simulacao(atual: ReturnType<typeof cenario>, pedido: ReturnType<typeof cenario>, prazo: string | null = '2026-12'): Simulacao {
  return {
    meta: { valor: 80, prazo, unidadeId: 'c', unidadeNome: 'Concessão', herdada: false, origem: null },
    fim: '2027-12',
    ritmoAtualProjetado: atual,
    cenario: pedido,
  } as unknown as Simulacao;
}

describe('textos do simulador', () => {
  it('formata reais em pt-BR', () => {
    expect(moeda(10000)).toBe('R$ 10.000,00');
    expect(moeda(null)).toBe('—');
  });

  it('descreve cada fórmula', () => {
    expect(comum(descreverRegra({
      formula: 'PERCENTUAL_DA_BASE_POR_PONTO', valor: 0.1, baseValor: 10_000_000, baseDescricao: 'Faturamento mensal',
      contagem: 'POR_PONTO_OU_FRACAO', periodicidade: 'MENSAL', teto: null,
    }))).toBe('0,1% de R$ 10.000.000,00 (faturamento mensal) por ponto percentual ou fração, a cada mês abaixo da meta.');
    expect(comum(descreverRegra({
      formula: 'VALOR_POR_PONTO', valor: 1500, baseValor: null, baseDescricao: null,
      contagem: 'PROPORCIONAL', periodicidade: 'ANUAL', teto: 5000,
    }))).toBe('R$ 1.500,00 por ponto percentual (proporcional), a cada 12 meses abaixo da meta, até R$ 5.000,00 por aferição.');
    expect(comum(descreverRegra({
      formula: 'VALOR_FIXO', valor: 80000, baseValor: null, baseDescricao: null,
      contagem: 'PROPORCIONAL', periodicidade: 'MENSAL', teto: null,
    }))).toBe('R$ 80.000,00, a cada mês abaixo da meta.');
  });

  it('diz se a meta sai no prazo, depois dele ou não sai', () => {
    const s = simulacao(cenario(81, 10000, 79.69, '2027-01'), cenario(90, 0, 80.01, '2026-12'));
    expect(veredito(s, s.cenario)).toBe('Com 90 ligações por mês, a meta de 80,0% sai até o prazo (dez/2026).');
    expect(veredito(s, s.ritmoAtualProjetado)).toBe(
      'Com 81 ligações por mês, a meta fica para jan/2027, depois do prazo: 79,7% no prazo.');
    const parado = simulacao(cenario(0, 1, 76.85, null), cenario(0, 1, 76.85, null));
    expect(veredito(parado, parado.cenario)).toBe('Com 0 ligações por mês, a meta não sai até dez/2027: 76,9% no prazo.');
  });

  it('compara a multa do cenário com a do ritmo atual', () => {
    const menor = comparacao(simulacao(cenario(81, 10000, 0, null), cenario(90, 0, 0, null)));
    expect(menor.tom).toBe('ok');
    expect(comum(menor.texto)).toBe('R$ 10.000,00 a menos que no ritmo atual.');
    expect(comparacao(simulacao(cenario(81, 10000, 0, null), cenario(0, 40000, 0, null))).tom).toBe('perigo');
    expect(comparacao(simulacao(cenario(81, 0, 0, null), cenario(90, 0, 0, null))).tom).toBe('neutro');
  });
});
