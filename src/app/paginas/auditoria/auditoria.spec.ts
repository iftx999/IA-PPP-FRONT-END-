import { parametros } from './auditoria';
import { gruposDeEventos, infoEvento, paresDeDetalhes } from './eventos';

describe('Auditoria', () => {
  it('agrupa os tipos na ordem do catálogo e mostra tipo novo pelo código', () => {
    const grupos = gruposDeEventos(['META_DEFINIDA', 'NOVO_TIPO', 'LOGIN', 'UNIDADE_MOVIDA']);
    expect(grupos.map((g) => g.grupo)).toEqual(['Acesso e usuários', 'Unidades', 'Metas', 'Outros']);
    expect(infoEvento('NOVO_TIPO').rotulo).toBe('NOVO_TIPO');
  });

  it('detalhes legíveis', () => {
    expect(paresDeDetalhes({ vigenciaInicio: '2026-01-01', antes: ['a'], fim: null })).toEqual([
      { chave: "vigencia inicio", valor: '2026-01-01' },
      { chave: 'antes', valor: '["a"]' },
      { chave: 'fim', valor: '—' },
    ]);
    expect(paresDeDetalhes(null)).toEqual([]);
  });

  it('parâmetros só com os filtros preenchidos', () => {
    expect(parametros({ usuario: null, tipos: [], de: null, ate: null, unidade: null })).toEqual({});
    expect(
      parametros({ usuario: 'u1', tipos: ['LOGIN'], de: '2026-10-01', ate: null, unidade: { id: 'x', nome: 'X', tipo: 'GRUPO', profundidade: 0, caminho: 'X' } }),
    ).toEqual({ usuario: 'u1', tipo: ['LOGIN'], de: '2026-10-01', unidade: 'x' });
  });
});
