import type { Dispositivo } from '../../api/tipos';
import type { Tom } from '../../ui/selo';

export type FiltroDispositivos = 'EM_USO' | 'BLOQUEADOS' | 'TODOS';

/** Situação do celular (J13): em uso, bloqueado aguardando limpeza, bloqueado e limpo. */
export function situacaoDoDispositivo(d: Dispositivo): { texto: string; tom: Tom } {
  if (!d.revogado) {
    return { texto: 'Em uso', tom: 'ok' };
  }
  return d.apagadoEm
    ? { texto: 'Bloqueado · dados apagados', tom: 'neutro' }
    : { texto: 'Bloqueado · aguardando conexão', tom: 'perigo' };
}

export function filtrarDispositivos(
  lista: readonly Dispositivo[],
  filtro: FiltroDispositivos,
): Dispositivo[] {
  return lista.filter((d) =>
    filtro === 'TODOS' ? true : filtro === 'BLOQUEADOS' ? d.revogado : !d.revogado,
  );
}
