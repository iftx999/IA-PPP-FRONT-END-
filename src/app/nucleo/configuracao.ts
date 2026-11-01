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
  /**
   * Vários clientes na mesma instalação (ADR 0027): antes do login a pessoa informa o código da empresa, que leva ao
   * realm dela. Desligado = todos entram no {@link emissor} (instalação de um cliente só).
   */
  escolherCliente?: boolean;
  /** Realm e client de quem administra a plataforma (/plataforma). */
  emissorPlataforma?: string;
  clientePlataforma?: string;
  /** Fundo do mapa contratado; ausente = OpenStreetMap (só desenvolvimento). */
  fundoDoMapa?: FundoDoMapa;
}

/** Valores do ambiente local (docker compose de desenvolvimento). */
export const CONFIGURACAO_LOCAL: ConfiguracaoAurora = {
  emissor: 'http://localhost:8180/realms/aurora',
  clienteId: 'aurora-web',
  escolherCliente: true,
  emissorPlataforma: 'http://localhost:8180/realms/plataforma',
  clientePlataforma: 'aurora-plataforma-web',
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
    return {
      emissor: lida.emissor,
      clienteId: lida.clienteId,
      escolherCliente: lida.escolherCliente === true,
      ...(lida.emissorPlataforma && lida.clientePlataforma
        ? { emissorPlataforma: lida.emissorPlataforma, clientePlataforma: lida.clientePlataforma }
        : {}),
      ...(lida.fundoDoMapa ? { fundoDoMapa: lida.fundoDoMapa } : {}),
    };
  } catch {
    return CONFIGURACAO_LOCAL;
  }
}
