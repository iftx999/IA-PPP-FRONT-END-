import { bootstrapApplication } from '@angular/platform-browser';
import { configuracaoDoApp } from './app/app.config';
import { App } from './app/app';
import { ROTA_RETORNO } from './app/nucleo/autenticacao';
import { ROTA_ACESSO, ROTA_PLATAFORMA, buscarCliente, clienteEscolhido, lembrarCliente, modoDeLogin } from './app/nucleo/cliente';
import { carregarConfiguracao } from './app/nucleo/configuracao';

/**
 * A configuração do ambiente (emissor OIDC, fundo do mapa) chega antes de o Angular iniciar, e com ela a decisão de
 * onde a pessoa entra (ADR 0027): realm da plataforma, realm do cliente lembrado ou a tela do código da empresa.
 */
async function iniciar(): Promise<void> {
  const configuracao = await carregarConfiguracao();
  const url = new URL(window.location.href);

  // Link direto com o código da empresa (ex.: https://aurora/?cliente=grupo-x): dispensa a tela do código.
  const codigo = url.searchParams.get('cliente');
  if (codigo && configuracao.escolherCliente) {
    url.searchParams.delete('cliente');
    window.history.replaceState(null, '', url);
    const cliente = await buscarCliente(codigo).catch(() => null);
    if (!cliente) {
      window.location.replace(`/${ROTA_ACESSO}?codigo=${encodeURIComponent(codigo)}`);
      return;
    }
    lembrarCliente(cliente);
  }

  const modo = modoDeLogin(configuracao, window.location.pathname, clienteEscolhido());
  const naTelaDoCodigo = window.location.pathname === `/${ROTA_ACESSO}`;
  if (modo.modo === 'escolher' && !naTelaDoCodigo) {
    const destino = window.location.pathname + window.location.search;
    window.location.replace(`/${ROTA_ACESSO}` + (destino === '/' ? '' : `?retorno=${encodeURIComponent(destino)}`));
    return;
  }
  const efetiva = modo.modo === 'escolher' ? configuracao : { ...configuracao, emissor: modo.emissor, clienteId: modo.clienteId };
  const retorno = modo.modo === 'plataforma' ? `${ROTA_PLATAFORMA}/${ROTA_RETORNO}` : ROTA_RETORNO;
  await bootstrapApplication(App, configuracaoDoApp(efetiva, retorno));
}

iniciar().catch((err) => console.error(err));
