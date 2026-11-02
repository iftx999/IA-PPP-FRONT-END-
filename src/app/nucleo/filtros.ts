import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, type Params } from '@angular/router';

/**
 * Filtros de lista guardados na URL: voltar de uma tela de detalhe, recarregar ou mandar o link
 * mantém a lista como estava. Chame no construtor (usa inject).
 */
export function filtrosNaUrl<const C extends string>(chaves: readonly C[]) {
  const router = inject(Router);
  const rota = inject(ActivatedRoute);
  const params = toSignal(rota.queryParams, { initialValue: rota.snapshot.queryParams });

  const aplicar = (valores: Partial<Record<C, string | null>>) => {
    const limpos: Params = {};
    for (const [chave, valor] of Object.entries(valores)) {
      limpos[chave] = valor === '' || valor == null ? null : valor;
    }
    void router.navigate([], { relativeTo: rota, queryParams: limpos, queryParamsHandling: 'merge', replaceUrl: true });
  };

  return {
    /** Valor atual de um filtro (null quando ausente). */
    valor: (chave: C): string | null => (params()[chave] as string | undefined) ?? null,
    /** Valor no momento da criação da tela (para iniciar campos de texto). */
    inicial: (chave: C): string => rota.snapshot.queryParamMap.get(chave) ?? '',
    aplicar,
    ativos: (): number => chaves.filter((c) => params()[c] != null && params()[c] !== '').length,
    limpar: () => aplicar(Object.fromEntries(chaves.map((c) => [c, null])) as Record<C, null>),
  };
}
