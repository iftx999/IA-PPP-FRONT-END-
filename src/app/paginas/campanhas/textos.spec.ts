import type { FunilCampanha, ImpactoNaMeta } from '../../api/tipos';
import {
  etapasDoFunil,
  frasesDoImpacto,
  linkDoPonto,
  motivosPara,
  variacaoDesdeACriacao,
} from './textos';

const impacto = (parcial: Partial<ImpactoNaMeta>): ImpactoNaMeta => ({
  unidadeId: 'u',
  unidadeNome: 'Cidade A',
  competencia: '2026-08',
  ligados: 700,
  comRede: 1000,
  adesao: 70,
  adesaoSeTodasLigarem: 78,
  meta: 75,
  faltamParaMeta: 50,
  ...parcial,
});

describe('textos das campanhas', () => {
  it('motivos combinam com o resultado', () => {
    expect(motivosPara('RECUSADA')).toContain('SEM_INTERESSE');
    expect(motivosPara('RECUSADA')).not.toContain('SEM_REDE_NA_RUA');
    expect(motivosPara('INVIAVEL')).toEqual([
      'SEM_REDE_NA_RUA',
      'IMOVEL_ABAIXO_DA_REDE',
      'IMOVEL_DESOCUPADO',
      'OUTRO',
    ]);
    expect(motivosPara('EXECUTADA')).toEqual([]);
  });

  it('impacto diz quanto da distância até a meta a campanha cobre', () => {
    const frases = frasesDoImpacto(impacto({}), 80);
    expect(frases[0]).toContain('70,0%');
    expect(frases[0]).toContain('78,0%');
    expect(frases[1]).toContain('Faltam 50 ligações');
    expect(frases[1]).toContain('cobre 50 (100,0%)');
    expect(frasesDoImpacto(impacto({ faltamParaMeta: 0 }), 5)[1]).toContain('já está atingida');
    expect(frasesDoImpacto(impacto({ adesao: null }), 5)).toHaveLength(1);
  });

  it('funil em frações das planejadas', () => {
    const f = { planejadas: 10, emCampo: 5, executadas: 4, confirmadas: 2 } as FunilCampanha;
    expect(etapasDoFunil(f).map((e) => e.fracao)).toEqual([1, 0.5, 0.4, 0.2]);
    expect(etapasDoFunil({ ...f, planejadas: 0, emCampo: 0 }).at(0)?.fracao).toBe(0);
  });

  it('efeito real em pontos percentuais', () => {
    expect(variacaoDesdeACriacao(700, 1000, impacto({ adesao: 71.25 }))).toBe(1.25);
    expect(variacaoDesdeACriacao(0, 0, impacto({}))).toBeNull();
  });

  it('ponto vira URI geo:', () => {
    expect(linkDoPonto({ latitude: -22.9, longitude: -47.06 })).toBe('geo:-22.9,-47.06');
    expect(linkDoPonto({ latitude: null, longitude: null })).toBeNull();
  });
});
