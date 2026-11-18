import type { TrechoLogradouro } from '../../api/tipos';
import {
  colecaoDosTrechos,
  enquadramento,
  extensao,
  faixaDoTrecho,
  indicadoresDaCobertura,
  nomeCompleto,
} from './textos';

const trecho = (p: Partial<TrechoLogradouro>): TrechoLogradouro => ({
  id: 't1',
  codigo: 'T1',
  extensaoM: 120,
  numeroInicial: null,
  numeroFinal: null,
  lado: 'AMBOS',
  imoveis: 0,
  coordenadas: [
    [-47.06, -22.9],
    [-47.05, -22.91],
  ],
  ...p,
});

describe('textos de logradouros', () => {
  it('junta tipo e nome sem repetir o tipo', () => {
    expect(nomeCompleto({ tipo: 'Rua', nome: 'das Flores' })).toBe('Rua das Flores');
    expect(nomeCompleto({ tipo: 'Rua', nome: 'Rua das Flores' })).toBe('Rua das Flores');
    expect(nomeCompleto({ tipo: 'Av.', nome: 'av. Brasil' })).toBe('av. Brasil');
    expect(nomeCompleto({ tipo: 'Rua', nome: 'Ruanda' })).toBe('Rua Ruanda');
    expect(nomeCompleto({ tipo: null, nome: 'Travessa A' })).toBe('Travessa A');
  });

  it('descreve a faixa do trecho', () => {
    expect(faixaDoTrecho(trecho({ numeroInicial: 1, numeroFinal: 99, lado: 'IMPAR' }))).toBe(
      '1 a 99 · lado ímpar',
    );
    expect(faixaDoTrecho(trecho({ numeroInicial: 2, numeroFinal: 1000, lado: 'AMBOS' }))).toBe(
      '2 a 1.000',
    );
    expect(faixaDoTrecho(trecho({ numeroInicial: 10 }))).toBe('a partir de 10');
    expect(faixaDoTrecho(trecho({ numeroFinal: 10, lado: 'PAR' }))).toBe('até 10 · lado par');
    expect(faixaDoTrecho(trecho({}))).toBe('sem numeração');
  });

  it('mostra a extensão em metros ou quilômetros', () => {
    expect(extensao(349.6)).toBe('350 m');
    expect(extensao(1000)).toBe('1 km');
    expect(extensao(1234)).toBe('1,2 km');
  });

  it('calcula a cobertura sem dividir por zero', () => {
    const [endereco, comTrecho, aproximados] = indicadoresDaCobertura({
      imoveis: 200,
      comEndereco: 150,
      comTrecho: 100,
      aproximados: 20,
    });
    expect(endereco!.valor).toBe('75,0%');
    expect(endereco!.detalhe).toBe('150 de 200 imóveis');
    expect(comTrecho!.valor).toBe('50,0%');
    expect(aproximados!.valor).toBe('10,0%');
    expect(
      indicadoresDaCobertura({ imoveis: 0, comEndereco: 0, comTrecho: 0, aproximados: 0 })[0]!
        .valor,
    ).toBe('—');
  });

  it('monta o GeoJSON e o enquadramento dos trechos', () => {
    const lista = [
      trecho({}),
      trecho({
        id: 't2',
        codigo: 'T2',
        coordenadas: [
          [-47.1, -22.8],
          [-47.0, -22.95],
        ],
      }),
    ];
    const colecao = colecaoDosTrechos(lista);
    expect(colecao.features).toHaveLength(2);
    expect(colecao.features[1]!.properties).toEqual({
      id: 't2',
      codigo: 'T2',
      faixa: 'sem numeração',
    });
    expect(enquadramento(lista)).toEqual([-47.1, -22.95, -47.0, -22.8]);
    expect(enquadramento([])).toBeNull();
  });
});
