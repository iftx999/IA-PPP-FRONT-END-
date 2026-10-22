import type { NoArvore, TipoUnidade } from '../../api/tipos';
import { caminhoDe, destinosParaMover, linhasVisiveis, tiposFilhos } from './arvore';

const no = (id: string, nome: string, tipo: NoArvore['tipo'], unidadePaiId: string | null, ativo = true): NoArvore => ({
  id, nome, tipo, unidadePaiId, ativo, codigo: id.toUpperCase(), codigoIbge: null, latitude: null, longitude: null,
  nivel: 0, filhasAtivas: 0, acessos: 0,
});

const TIPOS: TipoUnidade[] = [
  { codigo: 'GRUPO', descricao: 'Grupo', tiposPai: [], exigeCodigoIbge: false },
  { codigo: 'CONCESSAO', descricao: 'Concessão', tiposPai: ['GRUPO'], exigeCodigoIbge: false },
  { codigo: 'MUNICIPIO', descricao: 'Município', tiposPai: ['CONCESSAO'], exigeCodigoIbge: true },
  { codigo: 'SETOR_COMERCIAL', descricao: 'Setor', tiposPai: ['MUNICIPIO'], exigeCodigoIbge: false },
  { codigo: 'ETE', descricao: 'ETE', tiposPai: ['MUNICIPIO'], exigeCodigoIbge: false },
];

const NOS = [
  no('g', 'Grupo', 'GRUPO', null),
  no('c1', 'Concessão A', 'CONCESSAO', 'g'),
  no('c2', 'Concessão B', 'CONCESSAO', 'g'),
  no('m1', 'Cidade A', 'MUNICIPIO', 'c1'),
  no('m2', 'Cidade B', 'MUNICIPIO', 'c1'),
  no('s1', 'Setor Norte', 'SETOR_COMERCIAL', 'm1'),
  no('x', 'Velha', 'ETE', 'm2', false),
];

describe('Unidades', () => {
  it('achata a árvore respeitando recolhidas e inativas', () => {
    expect(linhasVisiveis(NOS, new Set(), '', false).map((l) => l.no.id)).toEqual(['g', 'c1', 'm1', 's1', 'm2', 'c2']);
    expect(linhasVisiveis(NOS, new Set(['c1']), '', true).map((l) => l.no.id)).toEqual(['g', 'c1', 'c2']);
    expect(linhasVisiveis(NOS, new Set(), '', true).find((l) => l.no.id === 'm2')?.temFilhas).toBe(true);
  });

  it('busca mostra quem casa e os ancestrais, abertos', () => {
    const linhas = linhasVisiveis(NOS, new Set(['g', 'c1']), 'norte', false);
    expect(linhas.map((l) => [l.no.id, l.profundidade])).toEqual([['g', 0], ['c1', 1], ['m1', 2], ['s1', 3]]);
  });

  it('tipos filhos e destinos válidos para mover', () => {
    expect(tiposFilhos(TIPOS, NOS[3]!).map((t) => t.codigo)).toEqual(['SETOR_COMERCIAL', 'ETE']);
    expect(destinosParaMover(NOS, TIPOS, NOS[3]!).map((n) => n.id)).toEqual(['c2']);
    expect(destinosParaMover(NOS, TIPOS, NOS[5]!).map((n) => n.id)).toEqual(['m2']);
    expect(caminhoDe(NOS, 's1')).toBe('Concessão A › Cidade A › Setor Norte');
    expect(caminhoDe(NOS, 'g')).toBe('Grupo');
  });
});
