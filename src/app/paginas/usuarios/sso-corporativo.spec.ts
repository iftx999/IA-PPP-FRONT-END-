import type { SsoCorporativo } from '../../api/tipos';
import { enderecosParaRegistrar, pedidoSso } from './sso-corporativo';

const sso: SsoCorporativo = {
  provedor: null,
  confiaSegundoFator: false,
  enderecoRetorno: 'https://id.cliente/realms/a/broker/corporativo/endpoint',
  entidadeSaml: 'https://id.cliente/realms/a',
  metadadosSaml: 'https://id.cliente/realms/a/broker/corporativo/endpoint/descriptor',
};

const valores = {
  protocolo: 'OIDC' as const, nome: '  Entra ID ', endereco: ' https://login/x ', clienteId: ' app ', segredo: '',
  habilitado: true, confiaSegundoFator: false,
};

describe('SSO corporativo', () => {
  it('mostra o endereço de retorno no OIDC e entidade, ACS e metadados no SAML', () => {
    expect(enderecosParaRegistrar(sso, 'OIDC').map((e) => e.valor)).toEqual([sso.enderecoRetorno]);
    expect(enderecosParaRegistrar(sso, 'SAML').map((e) => e.valor)).toEqual([
      sso.entidadeSaml, sso.enderecoRetorno, sso.metadadosSaml,
    ]);
  });

  it('segredo vazio vai como nulo (mantém o atual) e SAML não leva client nem segredo', () => {
    expect(pedidoSso(valores)).toEqual({
      protocolo: 'OIDC', nome: 'Entra ID', endereco: 'https://login/x', clienteId: 'app', segredo: null,
      habilitado: true, confiaSegundoFator: false,
    });
    expect(pedidoSso({ ...valores, segredo: 'novo' }).segredo).toBe('novo');
    const saml = pedidoSso({ ...valores, protocolo: 'SAML', segredo: 'esquecido' });
    expect([saml.clienteId, saml.segredo]).toEqual([null, null]);
  });
});
