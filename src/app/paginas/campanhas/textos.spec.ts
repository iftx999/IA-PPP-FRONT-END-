import type { FunilCampanha, ImpactoNaMeta, MotivoDaOrdem, StatusOrdem } from '../../api/tipos';
import {
  STATUS_DA_OS,
  alvoDaOrdem,
  comEquipe,
  etapasDoFunil,
  frasesDoImpacto,
  linkDoPonto,
  motivosPara,
  podeCancelar,
  podeEncerrar,
  podeProgramar,
  quantidadeComUnidade,
  variacaoDesdeACriacao,
} from './textos';

const motivo = (parcial: Partial<MotivoDaOrdem>): MotivoDaOrdem => ({
  id: 'm',
  tipo: 'DEVOLUCAO',
  codigo: 'OUTRO',
  nome: 'Outro',
  exigeObservacao: true,
  servicoId: null,
  ...parcial,
});

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
  it('motivos do tipo pedido, gerais ou do serviço', () => {
    const lista = [
      motivo({ id: 'geral' }),
      motivo({ id: 'do-servico', servicoId: 's1' }),
      motivo({ id: 'de-outro', servicoId: 's2' }),
      motivo({ id: 'cancelamento', tipo: 'CANCELAMENTO' }),
    ];
    expect(motivosPara(lista, 'DEVOLUCAO', 's1').map((m) => m.id)).toEqual(['geral', 'do-servico']);
    expect(motivosPara(lista, 'CANCELAMENTO', 's1').map((m) => m.id)).toEqual(['cancelamento']);
  });

  it('ações permitidas em cada situação (doc 10, 10.6)', () => {
    const quais = (f: (s: StatusOrdem) => boolean) => STATUS_DA_OS.filter(f);
    expect(quais(podeProgramar)).toEqual(['PLANEJADA', 'PROGRAMADA', 'DEVOLVIDA']);
    expect(quais(podeCancelar)).toEqual(['PLANEJADA', 'PROGRAMADA', 'DEVOLVIDA']);
    expect(quais(comEquipe)).toEqual(['PROGRAMADA', 'EM_EXECUCAO', 'PARALISADA']);
    expect(quais(podeEncerrar)).toEqual(['PROGRAMADA', 'EM_EXECUCAO']);
  });

  it('alvo da OS numa linha', () => {
    const base = {
      complemento: null,
      numeroImovel: null,
      logradouroNome: null,
      trechoCodigo: null,
    };
    expect(alvoDaOrdem({ ...base, alvo: 'IMOVEL', matricula: '2001002' })).toBe(
      'Matrícula 2001002',
    );
    expect(
      alvoDaOrdem({
        ...base,
        alvo: 'IMOVEL',
        matricula: '2001002',
        logradouroNome: 'Rua das Flores',
        numeroImovel: '12A',
      }),
    ).toBe('Matrícula 2001002 · Rua das Flores, 12A');
    expect(
      alvoDaOrdem({
        ...base,
        alvo: 'TRECHO',
        matricula: null,
        trechoCodigo: 'T-1',
        logradouroNome: 'Rua das Flores',
      }),
    ).toBe('Trecho T-1 · Rua das Flores');
  });

  it('quantidade com a unidade do serviço', () => {
    expect(quantidadeComUnidade(120.5, 'M')).toBe('120,5 m');
    expect(quantidadeComUnidade(3, 'M2')).toBe('3 m²');
    expect(quantidadeComUnidade(null, 'UN')).toBe('—');
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
