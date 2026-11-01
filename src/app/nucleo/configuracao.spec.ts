import { CONFIGURACAO_LOCAL, carregarConfiguracao } from './configuracao';

const respondendo = (status: number, corpo: unknown) =>
  (async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;

describe('configuração do ambiente', () => {
  it('usa o arquivo do ambiente quando ele existe', async () => {
    const lida = await carregarConfiguracao(
      respondendo(200, { emissor: 'https://id.empresa.com.br/realms/aurora', clienteId: 'aurora-web', extra: 1 }),
    );
    expect(lida).toEqual({ emissor: 'https://id.empresa.com.br/realms/aurora', clienteId: 'aurora-web', escolherCliente: false });
  });

  it('vários clientes e realm da plataforma (ADR 0027); plataforma vazia é ignorada', async () => {
    const completo = await carregarConfiguracao(
      respondendo(200, {
        emissor: 'e', clienteId: 'c', escolherCliente: true, emissorPlataforma: 'https://id/realms/plataforma',
        clientePlataforma: 'aurora-plataforma-web',
      }),
    );
    expect(completo.escolherCliente).toBe(true);
    expect(completo.emissorPlataforma).toBe('https://id/realms/plataforma');
    const semPlataforma = await carregarConfiguracao(
      respondendo(200, { emissor: 'e', clienteId: 'c', escolherCliente: 'sim', emissorPlataforma: '', clientePlataforma: 'x' }),
    );
    expect(semPlataforma).toEqual({ emissor: 'e', clienteId: 'c', escolherCliente: false });
  });

  it('cai nos valores locais sem arquivo ou com arquivo incompleto', async () => {
    expect(await carregarConfiguracao(respondendo(404, {}))).toEqual(CONFIGURACAO_LOCAL);
    expect(await carregarConfiguracao(respondendo(200, { emissor: 'x' }))).toEqual(CONFIGURACAO_LOCAL);
  });
});
