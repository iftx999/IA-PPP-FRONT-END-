import { CONFIGURACAO_LOCAL, carregarConfiguracao } from './configuracao';

const respondendo = (status: number, corpo: unknown) =>
  (async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;

describe('configuração do ambiente', () => {
  it('usa o arquivo do ambiente quando ele existe', async () => {
    const lida = await carregarConfiguracao(
      respondendo(200, { emissor: 'https://id.empresa.com.br/realms/aurora', clienteId: 'aurora-web', extra: 1 }),
    );
    expect(lida).toEqual({ emissor: 'https://id.empresa.com.br/realms/aurora', clienteId: 'aurora-web' });
  });

  it('cai nos valores locais sem arquivo ou com arquivo incompleto', async () => {
    expect(await carregarConfiguracao(respondendo(404, {}))).toEqual(CONFIGURACAO_LOCAL);
    expect(await carregarConfiguracao(respondendo(200, { emissor: 'x' }))).toEqual(CONFIGURACAO_LOCAL);
  });
});
