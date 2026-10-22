/** O mínimo de uma unidade para montar a árvore (serve para a lista simples e para a de administração). */
export interface NoUnidade {
  id: string;
  nome: string;
  tipo: string;
  unidadePaiId: string | null;
}

/** Unidade como opção de escolha: ordem da árvore, profundidade e caminho para busca e exibição. */
export interface OpcaoUnidade {
  id: string;
  nome: string;
  tipo: string;
  profundidade: number;
  /** "Concessão A › Cidade A", sem a raiz quando ela é o grupo (todos estão nele). */
  caminho: string;
}

/** Ordena as unidades em pré-ordem (pai antes dos filhos, irmãos por nome). Órfãs viram raízes. */
export function arvoreDeUnidades(unidades: NoUnidade[]): OpcaoUnidade[] {
  const ids = new Set(unidades.map((u) => u.id));
  const filhos = new Map<string | null, NoUnidade[]>();
  for (const u of unidades) {
    const pai = u.unidadePaiId && ids.has(u.unidadePaiId) ? u.unidadePaiId : null;
    filhos.set(pai, [...(filhos.get(pai) ?? []), u]);
  }
  const resultado: OpcaoUnidade[] = [];
  const visitar = (pai: string | null, profundidade: number, trilha: string[]) => {
    const irmaos = [...(filhos.get(pai) ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    for (const u of irmaos) {
      const caminho = [...trilha, u.nome];
      resultado.push({ id: u.id, nome: u.nome, tipo: u.tipo, profundidade, caminho: caminho.join(' › ') });
      visitar(u.id, profundidade + 1, profundidade === 0 && u.tipo === 'GRUPO' ? [] : caminho);
    }
  };
  visitar(null, 0, []);
  return resultado;
}

/** Busca sem diferenciar maiúsculas nem acentos, no nome e no caminho. */
export function filtrarUnidades(opcoes: OpcaoUnidade[], termo: string): OpcaoUnidade[] {
  const t = semAcento(termo.trim());
  return t ? opcoes.filter((o) => semAcento(o.caminho).includes(t)) : opcoes;
}

export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
}

/** A unidade raiz e todas as abaixo dela (para escolher só entre as unidades cobertas por um contrato). */
export function subarvore<T extends NoUnidade>(unidades: T[], raizId: string): T[] {
  const filhos = new Map<string, T[]>();
  for (const u of unidades) {
    if (u.unidadePaiId) {
      filhos.set(u.unidadePaiId, [...(filhos.get(u.unidadePaiId) ?? []), u]);
    }
  }
  const resultado: T[] = [];
  const raiz = unidades.find((u) => u.id === raizId);
  const visitar = (u: T) => {
    resultado.push(u);
    (filhos.get(u.id) ?? []).forEach(visitar);
  };
  if (raiz) {
    visitar(raiz);
  }
  return resultado;
}
