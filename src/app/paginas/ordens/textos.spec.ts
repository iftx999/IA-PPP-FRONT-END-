import type { ServicoParaOrdem } from '../../api/tipos';
import { matriculasDoTexto, prazoDoServico, servicosPara } from './textos';

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
