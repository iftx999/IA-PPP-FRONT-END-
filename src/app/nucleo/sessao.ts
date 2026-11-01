import { httpResource } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import type { Eu } from '../api/tipos';
import { entrarDeNovo } from './autenticacao';
import { esquecerCliente } from './cliente';
import { SegundoFatorEstado, exigeSegundoFator } from './segundo-fator';


/** Usuário autenticado como a API o enxerga (tenant, permissões efetivas). */
@Injectable({ providedIn: 'root' })
export class SessaoService {
  private readonly oidc = inject(OidcSecurityService);
  private readonly router = inject(Router);
  private readonly segundoFator = inject(SegundoFatorEstado);

  readonly eu = httpResource<Eu>(() => '/api/v1/eu');

  /** Usuário carregado, ou undefined enquanto carrega ou em erro (value() lança exceção em estado de erro). */
  readonly usuario = computed(() => (this.eu.hasValue() ? this.eu.value() : undefined));

  /** A política exige verificação em duas etapas e este login foi só com senha (H9). */
  readonly segundoFatorNecessario = computed(() => this.segundoFator.necessario() || exigeSegundoFator(this.eu.error()));

  /** 403 da API: token válido, mas a pessoa não é usuária ativa deste tenant. */
  readonly semAcesso = computed(() => {
    const erro = this.eu.error() as { status?: number } | undefined;
    return erro?.status === 403 && !this.segundoFatorNecessario();
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

  entrarComSegundoFator(): void {
    entrarDeNovo(this.oidc, this.router.url);
  }

  sair(): void {
    this.oidc.logoff().subscribe();
  }

  /**
   * ADR 0027: esquece a empresa deste navegador e encerra a sessão; na volta, sem empresa lembrada, a pessoa cai na
   * tela do código.
   */
  trocarDeEmpresa(): void {
    esquecerCliente();
    this.oidc.logoff().subscribe();
  }
}
