import { HttpErrorResponse } from '@angular/common/http';
import { mensagemDeErro } from './erro-api';
import { SEGUNDO_FATOR_NECESSARIO, exigeSegundoFator } from './segundo-fator';

const recusa = (status: number, corpo: unknown) => new HttpErrorResponse({ status, error: corpo });

describe('Segundo fator', () => {
  it('distingue a falta do segundo fator da falta de permissão', () => {
    const semCodigo = recusa(403, { detail: 'Entre de novo informando o código.', codigo: SEGUNDO_FATOR_NECESSARIO });
    expect(exigeSegundoFator(semCodigo)).toBe(true);
    expect(exigeSegundoFator(recusa(403, { detail: 'Sem permissão' }))).toBe(false);
    expect(exigeSegundoFator(recusa(401, { codigo: SEGUNDO_FATOR_NECESSARIO }))).toBe(false);
    expect(exigeSegundoFator(new Error('rede'))).toBe(false);

    expect(mensagemDeErro(semCodigo)).toBe('Entre de novo informando o código.');
    expect(mensagemDeErro(recusa(403, { detail: 'Sem permissão' }))).toBe('Seu perfil não permite esta ação.');
  });
});
