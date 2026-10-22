import { HttpErrorResponse } from '@angular/common/http';

/** Mensagem legível de um erro da API (Problem Details, RFC 9457). */
export function mensagemDeErro(erro: unknown, padrao = 'Não foi possível concluir. Tente novamente.'): string {
  if (erro instanceof HttpErrorResponse) {
    const detalhe = (erro.error as { detail?: string } | null)?.detail;
    if (erro.status === 403) {
      return 'Seu perfil não permite esta ação.';
    }
    if (erro.status === 400) {
      return 'Confira os campos: algum valor está fora do formato aceito.';
    }
    if (detalhe && [404, 409, 422, 503].includes(erro.status)) {
      return detalhe;
    }
  }
  return padrao;
}
