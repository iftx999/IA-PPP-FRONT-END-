import type { ParametroServico, Servico } from '../../api/tipos';
import {
  chaveDoRotulo,
  faixaDoParametro,
  filtrarServicos,
  origensDeCondicao,
  parametrosVisiveis,
  tempoPadrao,
  valoresDaCondicao,
} from './textos';

const parametro = (p: Partial<ParametroServico>): ParametroServico => ({
  chave: 'campo',
  rotulo: 'Campo',
  ajuda: null,
  tipo: 'TEXTO',
  obrigatorio: false,
  minimo: null,
  maximo: null,
  unidade: null,
  opcoes: [],
  condicao: null,
  ...p,
});

const servico = (nome: string, codigo: string, grupoId: string, ativo = true): Servico => ({
  id: codigo,
  grupoId,
  codigo,
  ativo,
  versao: 1,
  atualizadoEm: '2026-11-17T10:00:00Z',
  definicao: {
    nome,
    descricao: null,
    unidadeMedida: 'UN',
    alvo: 'IMOVEL',
    tempoPadraoMin: 20,
    tempoPorUnidade: false,
    prazos: { emergencialHoras: 24, altaDias: 2, mediaDias: 5, baixaDias: 10 },
    tipoVeiculoId: null,
    habilidadeId: null,
    conferidoPelaCarga: false,
    parametros: [],
  },
});

describe('textos do catálogo de serviços', () => {
  it('mostra o tempo padrão em minutos, horas ou por unidade', () => {
    expect(tempoPadrao({ tempoPadraoMin: 20, tempoPorUnidade: false, unidadeMedida: 'UN' })).toBe(
      '20 min',
    );
    expect(tempoPadrao({ tempoPadraoMin: 120, tempoPorUnidade: false, unidadeMedida: 'UN' })).toBe(
      '2 h',
    );
    expect(tempoPadrao({ tempoPadraoMin: 90, tempoPorUnidade: false, unidadeMedida: 'UN' })).toBe(
      '1 h 30 min',
    );
    expect(tempoPadrao({ tempoPadraoMin: 3, tempoPorUnidade: true, unidadeMedida: 'M' })).toBe(
      '3 min/m',
    );
    expect(tempoPadrao({ tempoPadraoMin: 15, tempoPorUnidade: true, unidadeMedida: 'M2' })).toBe(
      '15 min/m²',
    );
  });

  it('descreve a faixa de números, fotos e textos', () => {
    expect(
      faixaDoParametro(parametro({ tipo: 'DECIMAL', minimo: 0, maximo: 200, unidade: 'm' })),
    ).toBe('0 a 200 m');
    expect(faixaDoParametro(parametro({ tipo: 'FOTO', minimo: 1, maximo: 3 }))).toBe('1 a 3 fotos');
    expect(faixaDoParametro(parametro({ tipo: 'FOTO', minimo: 1, maximo: 1 }))).toBe('1 foto');
    expect(faixaDoParametro(parametro({ tipo: 'TEXTO', maximo: 500 }))).toBe('até 500 caracteres');
    expect(faixaDoParametro(parametro({ tipo: 'INTEIRO', minimo: 1 }))).toBe('a partir de 1');
    expect(faixaDoParametro(parametro({ tipo: 'SIM_NAO' }))).toBeNull();
  });

  it('condição só aponta para sim/não ou lista anteriores, com os valores certos', () => {
    const lista = [
      parametro({ chave: 'feito', tipo: 'SIM_NAO' }),
      parametro({ chave: 'obs', tipo: 'TEXTO' }),
      parametro({ chave: 'causa', tipo: 'LISTA', opcoes: ['Gordura', 'Raiz'] }),
      parametro({ chave: 'fotos', tipo: 'FOTO' }),
    ];
    expect(origensDeCondicao(lista, 0)).toEqual([]);
    expect(origensDeCondicao(lista, 3).map((p) => p.chave)).toEqual(['feito', 'causa']);
    expect(valoresDaCondicao(lista[0]).map((v) => v.rotulo)).toEqual(['Sim', 'Não']);
    expect(valoresDaCondicao(lista[2]).map((v) => v.valor)).toEqual(['Gordura', 'Raiz']);
    expect(valoresDaCondicao(undefined)).toEqual([]);
  });

  it('mostra no app só os parâmetros cuja condição foi atendida', () => {
    const lista = [
      parametro({ chave: 'teste', tipo: 'SIM_NAO' }),
      parametro({
        chave: 'resultado',
        tipo: 'SIM_NAO',
        condicao: { chave: 'teste', valor: 'true' },
      }),
    ];
    expect(parametrosVisiveis(lista, {}).map((p) => p.chave)).toEqual(['teste']);
    expect(parametrosVisiveis(lista, { teste: 'false' }).map((p) => p.chave)).toEqual(['teste']);
    expect(parametrosVisiveis(lista, { teste: 'true' }).map((p) => p.chave)).toEqual([
      'teste',
      'resultado',
    ]);
  });

  it('gera a chave do parâmetro a partir do rótulo', () => {
    expect(chaveDoRotulo('Extensão do ramal')).toBe('extensao_do_ramal');
    expect(chaveDoRotulo('  Volume (m³) ')).toBe('volume_m');
    expect(chaveDoRotulo('2ª foto')).toBe('p_2_foto');
    expect(chaveDoRotulo('—')).toBe('');
  });

  it('filtra por nome ou código sem acento, grupo e inativos', () => {
    const lista = [
      servico('Ligação nova de esgoto', 'LIGACAO_NOVA', 'g1'),
      servico('Limpeza de rede', 'LIMPEZA_REDE', 'g2'),
      servico('Religação', 'RELIGACAO', 'g1', false),
    ];
    expect(
      filtrarServicos(lista, { termo: 'ligacao', grupo: null, inativos: false }).map(
        (s) => s.codigo,
      ),
    ).toEqual(['LIGACAO_NOVA']);
    expect(
      filtrarServicos(lista, { termo: 'ligação', grupo: null, inativos: true }).map(
        (s) => s.codigo,
      ),
    ).toEqual(['LIGACAO_NOVA', 'RELIGACAO']);
    expect(
      filtrarServicos(lista, { termo: '', grupo: 'g2', inativos: false }).map((s) => s.codigo),
    ).toEqual(['LIMPEZA_REDE']);
    expect(filtrarServicos(lista, { termo: 'rede', grupo: 'g1', inativos: true })).toEqual([]);
  });
});
