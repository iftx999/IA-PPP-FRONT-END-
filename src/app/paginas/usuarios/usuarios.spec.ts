import type { Unidade, Usuario } from '../../api/tipos';
import { haQuantoTempo } from '../../nucleo/formato';
import { ancestrais, arvoreDeUnidades, filtrarUnidades } from '../../nucleo/unidades-arvore';
import { filtrarUsuarios, fimDoDia, iniciais } from './usuarios';

const unidade = (id: string, nome: string, tipo: string, unidadePaiId: string | null): Unidade => ({
  id, nome, tipo, unidadePaiId, codigo: id, codigoIbge: null,
});

const usuario = (nome: string, email: string, situacao: Usuario['situacao']): Usuario => ({
  id: email, nome, email, situacao, ultimoAcesso: null, convidadoEm: null, concessoes: [],
});

describe('Usuários', () => {
  it('ordena as unidades em árvore, com caminho sem o grupo e órfãs como raiz', () => {
    const opcoes = arvoreDeUnidades([
      unidade('b', 'Cidade B', 'MUNICIPIO', 'c'),
      unidade('g', 'Grupo Exemplo', 'GRUPO', null),
      unidade('a1', 'Setor A1', 'SETOR_COMERCIAL', 'a'),
      unidade('c', 'Concessão A', 'CONCESSAO', 'g'),
      unidade('a', 'Cidade A', 'MUNICIPIO', 'c'),
      unidade('x', 'Órfã', 'MUNICIPIO', 'fora-do-escopo'),
    ]);
    expect(opcoes.map((o) => [o.nome, o.profundidade])).toEqual([
      ['Grupo Exemplo', 0], ['Concessão A', 1], ['Cidade A', 2], ['Setor A1', 3], ['Cidade B', 2], ['Órfã', 0],
    ]);
    expect(opcoes[3]!.caminho).toBe('Concessão A › Cidade A › Setor A1');
    expect(filtrarUnidades(opcoes, 'CIDADE a').map((o) => o.id)).toEqual(['a', 'a1']);
  });

  it('filtra por situação e por nome ou e-mail sem acentos', () => {
    const lista = [
      usuario('João Gestor', 'joao@x.dev', 'ATIVO'),
      usuario('Ana', 'ana@x.dev', 'CONVITE_PENDENTE'),
      usuario('Bia', 'bia@x.dev', 'INATIVO'),
    ];
    expect(filtrarUsuarios(lista, 'TODOS', 'joao').map((u) => u.nome)).toEqual(['João Gestor']);
    expect(filtrarUsuarios(lista, 'CONVITE_PENDENTE', '').map((u) => u.nome)).toEqual(['Ana']);
    expect(filtrarUsuarios(lista, 'ATIVO', 'bia')).toEqual([]);
  });

  it('filtra por perfil e unidade nas concessões, com os dois valendo na mesma concessão', () => {
    const concessao = (perfilId: string, unidadeId: string) => ({
      id: perfilId + unidadeId, perfilId, perfil: perfilId, unidadeId, unidade: unidadeId, validoAte: null,
    });
    const lista = [
      { ...usuario('Gestor', 'g@x.dev', 'ATIVO'), concessoes: [concessao('gestor', 'a')] },
      { ...usuario('Leitor', 'l@x.dev', 'ATIVO'), concessoes: [concessao('leitura', 'b'), concessao('gestor', 'c')] },
      usuario('Sem acesso', 's@x.dev', 'ATIVO'),
    ];
    const nomes = (r: Usuario[]) => r.map((u) => u.nome);
    expect(nomes(filtrarUsuarios(lista, 'TODOS', '', { perfilId: 'gestor' }))).toEqual(['Gestor', 'Leitor']);
    expect(nomes(filtrarUsuarios(lista, 'TODOS', '', { unidades: new Set(['b']) }))).toEqual(['Leitor']);
    // Gestor só na "c" e leitura na "b": não é gestor na "b".
    expect(filtrarUsuarios(lista, 'TODOS', '', { perfilId: 'gestor', unidades: new Set(['b']) })).toEqual([]);
  });

  it('acha a unidade e as de cima até a raiz', () => {
    const unidades = [
      unidade('g', 'Grupo', 'GRUPO', null),
      unidade('c', 'Concessão', 'CONCESSAO', 'g'),
      unidade('a', 'Cidade A', 'MUNICIPIO', 'c'),
    ];
    expect(ancestrais(unidades, 'a').map((u) => u.id)).toEqual(['a', 'c', 'g']);
    expect(ancestrais(unidades, 'nao-existe')).toEqual([]);
  });

  it('iniciais, fim do dia local e tempo relativo', () => {
    expect(iniciais('  maria  da silva ')).toBe('MD');
    const fim = new Date(fimDoDia(new Date(2026, 11, 31)));
    expect([fim.getFullYear(), fim.getMonth(), fim.getDate(), fim.getHours()]).toEqual([2026, 11, 31, 23]);
    const agora = new Date('2026-10-22T12:00:00Z');
    expect(haQuantoTempo('2026-10-22T11:59:30Z', agora)).toBe('agora há pouco');
    expect(haQuantoTempo('2026-10-22T09:00:00Z', agora)).toBe('há 3 horas');
    expect(haQuantoTempo('2026-10-21T12:00:00Z', agora)).toBe('ontem');
  });
});
