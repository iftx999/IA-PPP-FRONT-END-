/**
 * Texto da resposta em blocos (parágrafos e listas) com as marcas [n] separadas, para o
 * template desenhar os chips de fonte. Nada vira HTML: o texto da IA é sempre texto.
 */
export type Trecho = { tipo: 'texto'; texto: string; forte?: boolean } | { tipo: 'fonte'; numero: number };

export type Bloco = { tipo: 'paragrafo'; trechos: Trecho[] } | { tipo: 'lista'; itens: Trecho[][] };

const ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/;

export function blocos(texto: string): Bloco[] {
  const resultado: Bloco[] = [];
  let lista: Trecho[][] | null = null;
  let paragrafo: string[] = [];
  const fecharParagrafo = () => {
    if (paragrafo.length) {
      resultado.push({ tipo: 'paragrafo', trechos: trechos(paragrafo.join(' ')) });
      paragrafo = [];
    }
  };
  for (const linha of texto.split('\n')) {
    if (ITEM.test(linha)) {
      fecharParagrafo();
      if (!lista) {
        lista = [];
        resultado.push({ tipo: 'lista', itens: lista });
      }
      lista.push(trechos(linha.replace(ITEM, '')));
    } else if (!linha.trim()) {
      fecharParagrafo();
      lista = null;
    } else {
      lista = null;
      paragrafo.push(linha.trim());
    }
  }
  fecharParagrafo();
  return resultado;
}

/** Separa marcas [n] e trechos em **negrito** (o markdown mais comum nas respostas). */
export function trechos(texto: string): Trecho[] {
  const resultado: Trecho[] = [];
  const padrao = /\[(\d+)]|\*\*([^*]+)\*\*/g;
  let inicio = 0;
  for (const m of texto.matchAll(padrao)) {
    if (m.index > inicio) {
      resultado.push({ tipo: 'texto', texto: texto.slice(inicio, m.index) });
    }
    if (m[1]) {
      resultado.push({ tipo: 'fonte', numero: Number(m[1]) });
    } else {
      resultado.push({ tipo: 'texto', texto: m[2]!, forte: true });
    }
    inicio = m.index + m[0].length;
  }
  if (inicio < texto.length) {
    resultado.push({ tipo: 'texto', texto: texto.slice(inicio) });
  }
  return resultado;
}

/** Texto para copiar: sem marcas de fonte nem asteriscos. */
export function textoParaCopiar(texto: string): string {
  return texto.replace(/\s*\[\d+]/g, '').replace(/\*\*([^*]+)\*\*/g, '$1');
}
