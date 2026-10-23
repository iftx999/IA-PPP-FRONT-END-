import { blocos, textoParaCopiar, trechos } from './texto-da-resposta';

describe('texto da resposta do assistente', () => {
  it('separa marcas de fonte e negrito, sem gerar HTML', () => {
    expect(trechos('A **Cidade A** está com 85,41% [1] e <b>x</b> [2].')).toEqual([
      { tipo: 'texto', texto: 'A ' },
      { tipo: 'texto', texto: 'Cidade A', forte: true },
      { tipo: 'texto', texto: ' está com 85,41% ' },
      { tipo: 'fonte', numero: 1 },
      { tipo: 'texto', texto: ' e <b>x</b> ' },
      { tipo: 'fonte', numero: 2 },
      { tipo: 'texto', texto: '.' },
    ]);
  });

  it('monta parágrafos e listas', () => {
    const resultado = blocos('Abaixo do alerta:\n- Setor Norte: 61% [1]\n- Setor Sul [2]\n\nOs demais estão ok.');
    expect(resultado.map((b) => b.tipo)).toEqual(['paragrafo', 'lista', 'paragrafo']);
    const lista = resultado[1] as { tipo: 'lista'; itens: unknown[] };
    expect(lista.itens).toHaveLength(2);
  });

  it('copia sem marcas', () => {
    expect(textoParaCopiar('Adesão de **85,41%** [1].')).toBe('Adesão de 85,41%.');
  });
});
