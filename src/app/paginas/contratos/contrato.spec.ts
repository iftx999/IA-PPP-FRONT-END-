import type { ItemContratual } from '../../api/tipos';
import { subarvore } from '../../nucleo/unidades-arvore';
import { diferencasDaIa } from './contrato';
import { referencia } from './rotulos';

const item = (mudancas: Partial<ItemContratual>): ItemContratual => ({
  id: 'i', contratoId: 'c', documentoId: 'd', tipo: 'META', titulo: 'Adesão mínima', resumo: 'r', clausula: '7.2',
  pagina: 2, trecho: 't', valorReferencia: 80, unidadeMedida: '%', dataLimite: '2026-12-31', periodicidade: null,
  unidadeId: 'u', unidadeNome: 'Concessão A', valorAlerta: 75, vigenciaInicio: null, status: 'PROPOSTO', origem: 'IA',
  modeloIa: 'claude-opus-5-5', confianca: 0.9, semReferencia: false, propostoEm: '2026-10-22T12:00:00Z',
  revisadoPor: null, revisadoEm: null, motivoRevisao: null, substituidoPor: null,
  propostaIa: {
    titulo: 'Adesão mínima', clausula: '7.2', pagina: 2, valorReferencia: 80, valorAlerta: null,
    dataLimite: '2026-12-31', vigenciaInicio: null, unidadeAlvo: 'Concessão A',
  },
  ...mudancas,
});

describe('Contrato', () => {
  it('mostra só os campos que a revisão mudou em relação à IA', () => {
    expect(diferencasDaIa(item({}))).toEqual([{ campo: 'Limite de alerta', ia: '—' }]);
    expect(diferencasDaIa(item({ valorAlerta: null, pagina: 3, clausula: '7.3' })).map((d) => d.campo)).toEqual(['Cláusula', 'Página']);
    expect(diferencasDaIa(item({ propostaIa: null, origem: 'MANUAL' }))).toEqual([]);
  });

  it('referência da cláusula e subárvore do contrato', () => {
    expect(referencia('7.2', 2)).toBe('cl. 7.2 · p. 2');
    expect(referencia(null, 4)).toBe('p. 4');
    const nos = [
      { id: 'g', nome: 'G', tipo: 'GRUPO', unidadePaiId: null },
      { id: 'c', nome: 'C', tipo: 'CONCESSAO', unidadePaiId: 'g' },
      { id: 'm', nome: 'M', tipo: 'MUNICIPIO', unidadePaiId: 'c' },
      { id: 'x', nome: 'X', tipo: 'CONCESSAO', unidadePaiId: 'g' },
    ];
    expect(subarvore(nos, 'c').map((n) => n.id)).toEqual(['c', 'm']);
    expect(subarvore(nos, 'nao-existe')).toEqual([]);
  });
});
