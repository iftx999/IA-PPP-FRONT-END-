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
export function provideAutenticacao(configuracao: ConfiguracaoAurora): EnvironmentProviders {
  const origem = window.location.origin;
  const pedido = window.location.pathname + window.location.search + window.location.hash;
  enderecoInicial = pedido.startsWith(`/${ROTA_RETORNO}`) || pedido === '/' ? null : pedido;
  return provideAuth(
    {
      config: {
        authority: configuracao.emissor,
        clientId: configuracao.clienteId,
        // Retorno numa rota própria, sem redirecionamentos: evita a corrida entre o redirecionamento de "/" e a
        // navegação para a rota pedida (a pessoa caía no Painel).
        redirectUrl: `${origem}/${ROTA_RETORNO}`,
        // Depois do callback a biblioteca navega para cá (o padrão "/" redirecionava ao Painel).
        postLoginRoute: `/${ROTA_RETORNO}`,
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

/** Volta do Keycloak: segue para a rota pedida antes do login (ou o Painel). */
@Component({ selector: 'aurora-retorno-login', template: '' })
export class RetornoDoLogin implements OnInit {
  private readonly oidc = inject(OidcSecurityService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    const { isAuthenticated } = await firstValueFrom(this.oidc.isAuthenticated$);
    const destino = sessionStorage.getItem(CHAVE_RETORNO);
    sessionStorage.removeItem(CHAVE_RETORNO);
    const seguro = destino?.startsWith('/') && !destino.startsWith('//') && !destino.startsWith(`/${ROTA_RETORNO}`);
    await this.router.navigateByUrl(isAuthenticated && seguro ? destino! : '/painel', { replaceUrl: true });
  }
}
