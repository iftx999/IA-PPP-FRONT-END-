import { normalizarParaBusca, pedacosDoTrecho, type PedacoDeTexto } from './visualizador-pdf';

const p = (texto: string): PedacoDeTexto => ({ texto, caixa: [0, 0, 10, 10] });

describe('Visualizador de PDF', () => {
  it('acha o trecho entre pedaços de linha, sem acento nem caixa', () => {
    const pedacos = [p('7.1 A Concessionária deverá atingir'), p('adesão mínima de 80% (oitenta'), p('por cento) dos imóveis'), p('8.1 Outra cláusula')];
    expect(pedacosDoTrecho(pedacos, 'ADESAO MINIMA de 80% (oitenta por cento)')).toEqual([1, 2]);
    expect(pedacosDoTrecho(pedacos, 'texto que não existe')).toEqual([]);
    expect(pedacosDoTrecho(pedacos, 'curto')).toEqual([]);
  });

  it('normaliza espaços e acentos', () => {
    expect(normalizarParaBusca('  Estação\n de   Tratamento ')).toBe('estacao de tratamento');
  });
});
