import { Component, EnvironmentProviders, OnInit, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LogLevel, OidcSecurityService, provideAuth, withAppInitializerAuthCheck } from 'angular-auth-oidc-client';
import { firstValueFrom } from 'rxjs';

import type { ConfiguracaoAurora } from './configuracao';

/** Rota de retorno do Keycloak (cadastrada no realm em http://localhost:4200/*). */
export const ROTA_RETORNO = 'entrar';

/** Onde a pessoa queria ir antes do login; lido na volta. */
const CHAVE_RETORNO = 'aurora.retorno';

/**
 * Endereço pedido no carregamento da página, capturado antes da verificação de sessão da
 * biblioteca OIDC (que reescreve o endereço para "/" e faria a pessoa cair no Painel).
 */
let enderecoInicial: string | null = null;

/**
 * Login OIDC (código + PKCE) no Keycloak. O token só é anexado às chamadas para /api.
 * O tenant é identificado pela API a partir do emissor do token, nunca pelo front.
 */
export function provideAutenticacao(configuracao: ConfiguracaoAurora, retorno = ROTA_RETORNO): EnvironmentProviders {
  const origem = window.location.origin;
  const pedido = window.location.pathname + window.location.search + window.location.hash;
  enderecoInicial = pedido.startsWith(`/${retorno}`) || pedido === '/' ? null : pedido;
  return provideAuth(
    {
      config: {
        authority: configuracao.emissor,
        clientId: configuracao.clienteId,
        // Retorno numa rota própria, sem redirecionamentos: evita a corrida entre o redirecionamento de "/" e a
        // navegação para a rota pedida (a pessoa caía no Painel).
        redirectUrl: `${origem}/${retorno}`,
        // Depois do callback a biblioteca navega para cá (o padrão "/" redirecionava ao Painel).
        postLoginRoute: `/${retorno}`,
        postLogoutRedirectUri: origem,
        scope: 'openid profile email',
        responseType: 'code',
        silentRenew: true,
        useRefreshToken: true,
        renewTimeBeforeTokenExpiresInSeconds: 30,
        secureRoutes: ['/api'],
        logLevel: LogLevel.Warn,
      },
    },
    withAppInitializerAuthCheck(),
  );
}

/**
 * Exige sessão: sem ela, guarda a rota pedida e vai ao Keycloak. A sessão foi conferida
 * na inicialização (withAppInitializerAuthCheck).
 */
export const exigirLogin: CanActivateFn = async (_rota, estado) => {
  const oidc = inject(OidcSecurityService);
  const { isAuthenticated } = await firstValueFrom(oidc.isAuthenticated$);
  if (isAuthenticated) {
    return true;
  }
  sessionStorage.setItem(CHAVE_RETORNO, enderecoInicial ?? estado.url);
  oidc.authorize();
  return false;
};

/**
 * Novo login pedindo senha e código (prompt=login), voltando para a mesma tela. Quem ainda não cadastrou o código
 * faz o cadastro nesse login (H9).
 */
export function entrarDeNovo(oidc: OidcSecurityService, destino: string): void {
  sessionStorage.setItem(CHAVE_RETORNO, destino);
  oidc.authorize(undefined, { customParams: { prompt: 'login' } });
}

/** Volta do Keycloak: segue para a rota pedida antes do login (ou o Painel). */
@Component({ selector: 'aurora-retorno-login', template: '' })
export class RetornoDoLogin implements OnInit {
  private readonly oidc = inject(OidcSecurityService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    const { isAuthenticated } = await firstValueFrom(this.oidc.isAuthenticated$);
    const destino = sessionStorage.getItem(CHAVE_RETORNO);
    sessionStorage.removeItem(CHAVE_RETORNO);
    const seguro = destino?.startsWith('/') && !destino.startsWith('//') && !destino.includes(`/${ROTA_RETORNO}`);
    // A plataforma volta para a própria área; os clientes, para a tela inicial do perfil.
    const padrao = this.router.url.startsWith('/plataforma') ? '/plataforma' : '/';
    await this.router.navigateByUrl(isAuthenticated && seguro ? destino! : padrao, { replaceUrl: true });
  }
}
