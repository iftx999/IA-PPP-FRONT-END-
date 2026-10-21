import { EnvironmentProviders } from '@angular/core';
import { LogLevel, provideAuth, withAppInitializerAuthCheck } from 'angular-auth-oidc-client';

/**
 * Login OIDC (código + PKCE) no Keycloak. O token só é anexado às chamadas para /api.
 * O tenant é identificado pela API a partir do emissor do token, nunca pelo front.
 */
export function provideAutenticacao(): EnvironmentProviders {
  const origem = window.location.origin;
  return provideAuth(
    {
      config: {
        authority: 'http://localhost:8180/realms/aurora',
        clientId: 'aurora-web',
        redirectUrl: origem,
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
