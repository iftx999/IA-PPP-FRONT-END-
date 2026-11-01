import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { filter, firstValueFrom, map } from 'rxjs';
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
  private readonly http = inject(HttpClient);

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

  /** Emite quando /eu termina de carregar (usuário, ou undefined em erro). */
  private readonly carregado = toObservable(
    computed(() => (this.eu.isLoading() || this.eu.status() === 'idle' ? null : { usuario: this.usuario() })),
  );

  /** Para guards: espera o /eu e devolve o usuário (undefined se a API recusou). */
  aguardarUsuario(): Promise<Eu | undefined> {
    return firstValueFrom(
      this.carregado.pipe(
        filter((c) => c !== null),
        map((c) => c.usuario),
      ),
    );
  }

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
   * Doc 08, 8.6: encerra as sessões da pessoa em todos os dispositivos (no provedor de identidade) e sai deste.
   * @returns false se a API não conseguiu encerrar (a pessoa continua conectada aqui para tentar de novo)
   */
  async sairDeTodosOsDispositivos(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.delete('/api/v1/eu/sessoes'));
    } catch {
      return false;
    }
    this.sair();
    return true;
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
