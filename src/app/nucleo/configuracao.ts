import { InjectionToken } from '@angular/core';
import type { FundoDoMapa } from './fundo-mapa';

/**
 * Configuração do ambiente, lida de /configuracao.json antes de o Angular iniciar (ADR 0022): a mesma imagem do front
 * serve desenvolvimento, homologação e produção. Nada aqui é segredo (o navegador vê tudo).
 */
export interface ConfiguracaoAurora {
  /** Emissor OIDC (realm do Keycloak). */
  emissor: string;
  clienteId: string;
  /** Fundo do mapa contratado; ausente = OpenStreetMap (só desenvolvimento). */
  fundoDoMapa?: FundoDoMapa;
}

/** Valores do ambiente local (docker compose de desenvolvimento). */
export const CONFIGURACAO_LOCAL: ConfiguracaoAurora = {
  emissor: 'http://localhost:8180/realms/aurora',
  clienteId: 'aurora-web',
};

export const CONFIGURACAO = new InjectionToken<ConfiguracaoAurora>('CONFIGURACAO', {
  providedIn: 'root',
  factory: () => CONFIGURACAO_LOCAL,
});

export async function carregarConfiguracao(buscar: typeof fetch = fetch): Promise<ConfiguracaoAurora> {
  try {
    const resposta = await buscar('/configuracao.json', { cache: 'no-store' });
    if (!resposta.ok) {
      return CONFIGURACAO_LOCAL;
    }
    const lida = (await resposta.json()) as Partial<ConfiguracaoAurora>;
    if (!lida.emissor || !lida.clienteId) {
      return CONFIGURACAO_LOCAL;
    }
    return { emissor: lida.emissor, clienteId: lida.clienteId, ...(lida.fundoDoMapa ? { fundoDoMapa: lida.fundoDoMapa } : {}) };
  } catch {
    return CONFIGURACAO_LOCAL;
  }
}
