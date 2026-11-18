import type { EventoDaOrdem, ParametroDaExecucao, ServicoParaOrdem } from '../../api/tipos';
import {
  distancia,
  encerramentoComValores,
  matriculasDoTexto,
  prazoDoServico,
  servicosPara,
  valorDoParametro,
} from './textos';

const servico = (codigo: string, alvo: ServicoParaOrdem['alvo']): ServicoParaOrdem => ({
  id: codigo,
  versao: 1,
  codigo,
  nome: codigo,
  grupoNome: 'Rede',
  alvo,
  unidadeMedida: 'UN',
  conferidoPelaCarga: false,
  prazoEmergencialHoras: 6,
  prazoAltaDias: 1,
  prazoMediaDias: 5,
  prazoBaixaDias: 10,
});

describe('textos da programação', () => {
  it('serviços pelo alvo do modo', () => {
    const lista = [servico('V', 'IMOVEL'), servico('L', 'TRECHO'), servico('P', 'AMBOS')];
    expect(servicosPara(lista, 'IMOVEIS').map((s) => s.codigo)).toEqual(['V', 'P']);
    expect(servicosPara(lista, 'LOTE').map((s) => s.codigo)).toEqual(['V', 'P']);
    expect(servicosPara(lista, 'TRECHOS').map((s) => s.codigo)).toEqual(['L', 'P']);
  });

  it('matrículas de um texto colado', () => {
    expect(matriculasDoTexto(' 2001002\n2001003, 2001002;X-9  ')).toEqual([
      '2001002',
      '2001003',
      'X-9',
    ]);
    expect(matriculasDoTexto('   ')).toEqual([]);
  });

  it('prazo em palavras (RN-21)', () => {
    const s = servico('V', 'IMOVEL');
    expect(prazoDoServico(s, 'EMERGENCIAL')).toBe('6 h corridas');
    expect(prazoDoServico(s, 'ALTA')).toBe('1 dia útil');
    expect(prazoDoServico(s, 'BAIXA')).toBe('10 dias úteis');
  });
});

describe('registros do campo', () => {
  const p = (
    tipo: ParametroDaExecucao['tipo'],
    unidade: string | null = null,
  ): ParametroDaExecucao => ({
    chave: 'x',
    rotulo: 'X',
    tipo,
    unidade,
  });

  it('mostra o valor de cada tipo de parâmetro', () => {
    expect(valorDoParametro(p('SIM_NAO'), true)).toBe('Sim');
    expect(valorDoParametro(p('SIM_NAO'), false)).toBe('Não');
    expect(valorDoParametro(p('DECIMAL', 'm'), 12.5)).toBe('12,5 m');
    expect(valorDoParametro(p('INTEIRO'), 3)).toBe('3');
    expect(valorDoParametro(p('LISTA_MULTIPLA'), ['A', 'B'])).toBe('A, B');
    expect(valorDoParametro(p('FOTO'), ['a'])).toBe('1 foto');
    expect(valorDoParametro(p('FOTO'), ['a', 'b'])).toBe('2 fotos');
    expect(valorDoParametro(p('TEXTO'), 'ok')).toBe('ok');
    expect(valorDoParametro(p('TEXTO'), null)).toBe('—');
    expect(valorDoParametro(p('DATA_HORA'), '2026-11-18T13:00:00Z')).toMatch(/18\/11\/2026/);
  });

  it('usa o último encerramento que valeu', () => {
    const evento = (id: string, tipo: EventoDaOrdem['tipo'], situacao: string, valores?: object) =>
      ({ id, tipo, situacao, valores }) as unknown as EventoDaOrdem;
    const eventos = [
      evento('1', 'INICIAR', 'APLICADO'),
      evento('2', 'ENCERRAR', 'APLICADO', { a: 1 }),
      evento('3', 'ENCERRAR', 'REJEITADO', { a: 2 }),
    ];
    expect(encerramentoComValores(eventos)?.id).toBe('2');
    expect(encerramentoComValores([eventos[0]])).toBeUndefined();
  });

  it('distância em metros ou quilômetros', () => {
    expect(distancia(null)).toBe('');
    expect(distancia(420.4)).toBe('420 m');
    expect(distancia(1530)).toBe('1,5 km');
  });
});
