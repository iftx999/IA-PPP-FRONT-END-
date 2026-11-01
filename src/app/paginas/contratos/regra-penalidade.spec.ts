import { sugestaoDaRegra } from './regra-penalidade';

describe('sugestão da regra de penalidade', () => {
  it('lê % e "por ponto ou fração" do item aprovado', () => {
    expect(sugestaoDaRegra({
      valorReferencia: 0.1, unidadeMedida: '%', periodicidade: null,
      trecho: 'multa de 0,1% do faturamento mensal por ponto percentual ou fração abaixo da meta',
    })).toEqual({ formula: 'PERCENTUAL_DA_BASE_POR_PONTO', valor: 0.1, contagem: 'POR_PONTO_OU_FRACAO', periodicidade: 'MENSAL' });
  });

  it('sem % sugere reais por ponto; "anual" vira aferição a cada 12 meses', () => {
    expect(sugestaoDaRegra({ valorReferencia: null, unidadeMedida: null, periodicidade: 'anual', trecho: 'multa' })).toEqual({
      formula: 'VALOR_POR_PONTO', valor: null, contagem: 'PROPORCIONAL', periodicidade: 'ANUAL',
    });
  });
});
