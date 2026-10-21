import { httpResource } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';

export interface Eu {
  usuarioId: string;
  nome: string;
  email: string;
  tenantId: string;
  tenant: string;
  permissoes: string[];
}

/** Usuário autenticado como a API o enxerga (tenant, permissões efetivas). */
@Injectable({ providedIn: 'root' })
export class SessaoService {
  private readonly oidc = inject(OidcSecurityService);

  readonly eu = httpResource<Eu>(() => '/api/v1/eu');

  /** Usuário carregado, ou undefined enquanto carrega ou em erro (value() lança exceção em estado de erro). */
  readonly usuario = computed(() => (this.eu.hasValue() ? this.eu.value() : undefined));

  /** 403 da API: token válido, mas a pessoa não é usuária ativa deste tenant. */
  readonly semAcesso = computed(() => {
    const erro = this.eu.error() as { status?: number } | undefined;
    return erro?.status === 403;
  });

  readonly iniciais = computed(() =>
    (this.usuario()?.nome ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0]!.toUpperCase())
      .join(''),
  );

  pode(permissao: string): boolean {
    return this.usuario()?.permissoes.includes(permissao) ?? false;
  }

  sair(): void {
    this.oidc.logoff().subscribe();
  }
}
