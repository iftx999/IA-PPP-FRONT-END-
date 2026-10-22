import type { CodigoTipoUnidade, NoArvore, TipoUnidade } from '../../api/tipos';
import { semAcento } from '../../nucleo/unidades-arvore';

export const ICONES: Record<CodigoTipoUnidade, string> = {
  GRUPO: 'corporate_fare',
  CONCESSAO: 'account_balance',
  MUNICIPIO: 'location_city',
  SETOR_COMERCIAL: 'map',
  ETE: 'water_drop',
  EEE: 'valve',
};

/** Linha visível da árvore. */
export interface LinhaArvore {
  no: NoArvore;
  profundidade: number;
  temFilhas: boolean;
  aberta: boolean;
}

/** Filhos por pai, irmãos ordenados por nome. */
export function filhosPorPai(nos: NoArvore[]): Map<string | null, NoArvore[]> {
  const ids = new Set(nos.map((n) => n.id));
  const mapa = new Map<string | null, NoArvore[]>();
  for (const n of nos) {
    const pai = n.unidadePaiId && ids.has(n.unidadePaiId) ? n.unidadePaiId : null;
    mapa.set(pai, [...(mapa.get(pai) ?? []), n]);
  }
  for (const irmaos of mapa.values()) {
    irmaos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  return mapa;
}

/**
 * Árvore achatada para exibir. Com busca, mostra quem casa (nome ou código) e os ancestrais, tudo aberto.
 * Inativas só aparecem quando pedidas (as filhas de uma inativa também são inativas).
 */
export function linhasVisiveis(nos: NoArvore[], fechadas: Set<string>, termo: string, mostrarInativas: boolean): LinhaArvore[] {
  const considerados = mostrarInativas ? nos : nos.filter((n) => n.ativo);
  const filhos = filhosPorPai(considerados);
  const t = semAcento(termo.trim());
  let incluir: Set<string> | null = null;
  if (t) {
    const porId = new Map(considerados.map((n) => [n.id, n]));
    incluir = new Set();
    for (const n of considerados) {
      if (semAcento(n.nome).includes(t) || semAcento(n.codigo).includes(t)) {
        for (let atual: NoArvore | undefined = n; atual; atual = atual.unidadePaiId ? porId.get(atual.unidadePaiId) : undefined) {
          incluir.add(atual.id);
        }
      }
    }
  }
  const linhas: LinhaArvore[] = [];
  const visitar = (pai: string | null, profundidade: number) => {
    for (const no of filhos.get(pai) ?? []) {
      if (incluir && !incluir.has(no.id)) {
        continue;
      }
      const temFilhas = (filhos.get(no.id) ?? []).some((f) => !incluir || incluir.has(f.id));
      const aberta = !!incluir || !fechadas.has(no.id);
      linhas.push({ no, profundidade, temFilhas, aberta });
      if (temFilhas && aberta) {
        visitar(no.id, profundidade + 1);
      }
    }
  };
  visitar(null, 0);
  return linhas;
}

/** Tipos que podem ser criados abaixo de uma unidade. */
export function tiposFilhos(tipos: TipoUnidade[], pai: NoArvore): TipoUnidade[] {
  return tipos.filter((t) => t.tiposPai.includes(pai.tipo));
}

/** Destinos válidos para mover: ativos, do tipo aceito e fora da própria subárvore. */
export function destinosParaMover(nos: NoArvore[], tipos: TipoUnidade[], unidade: NoArvore): NoArvore[] {
  const aceitos = tipos.find((t) => t.codigo === unidade.tipo)?.tiposPai ?? [];
  const filhos = filhosPorPai(nos);
  const subarvore = new Set<string>();
  const marcar = (id: string) => {
    subarvore.add(id);
    for (const f of filhos.get(id) ?? []) {
      marcar(f.id);
    }
  };
  marcar(unidade.id);
  return nos.filter((n) => n.ativo && aceitos.includes(n.tipo) && !subarvore.has(n.id) && n.id !== unidade.unidadePaiId);
}

/** "Concessão A › Cidade B", sem o grupo raiz. */
export function caminhoDe(nos: NoArvore[], id: string): string {
  const porId = new Map(nos.map((n) => [n.id, n]));
  const nomes: string[] = [];
  for (let atual = porId.get(id); atual; atual = atual.unidadePaiId ? porId.get(atual.unidadePaiId) : undefined) {
    if (atual.unidadePaiId || atual.tipo !== 'GRUPO') {
      nomes.unshift(atual.nome);
    }
  }
  return nomes.join(' › ') || (porId.get(id)?.nome ?? '');
}
