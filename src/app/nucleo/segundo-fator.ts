import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { tap } from 'rxjs';

/** Código do 403 da API quando a política exige o segundo fator e o token não o comprova (H9). */
export const SEGUNDO_FATOR_NECESSARIO = 'SEGUNDO_FATOR_NECESSARIO';

export function exigeSegundoFator(erro: unknown): boolean {
  return (
    erro instanceof HttpErrorResponse &&
    erro.status === 403 &&
    (erro.error as { codigo?: string } | null)?.codigo === SEGUNDO_FATOR_NECESSARIO
  );
}

/** Marcado por qualquer chamada recusada: a política pode mudar no meio da sessão. */
@Injectable({ providedIn: 'root' })
export class SegundoFatorEstado {
  readonly necessario = signal(false);
}

/** Leva a recusa por falta de segundo fator para o aviso do shell, em vez de "sem permissão". */
export const interceptarSegundoFator: HttpInterceptorFn = (pedido, proximo) => {
  const estado = inject(SegundoFatorEstado);
  return proximo(pedido).pipe(
    tap({
      error: (erro: unknown) => {
        if (exigeSegundoFator(erro)) {
          estado.necessario.set(true);
        }
      },
    }),
  );
};
