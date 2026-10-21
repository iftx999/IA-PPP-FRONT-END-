import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { ImovelSemLigacao, SemLigacao as DadosSemLigacao, SituacaoImovel } from '../../api/tipos';
import { DownloadService } from '../../nucleo/download';
import { competenciaCurta, competenciaLonga, numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { Selo } from '../../ui/selo';

type Aba = 'TODOS' | SituacaoImovel;

const LIMITE = 50;

/**
 * Imóveis com rede disponível e sem ligação (épico D). Filtros na URL; "Carregar mais" segue o cursor da API.
 * A Aurora não guarda nome nem endereço: a pessoa localiza o imóvel no sistema comercial pela matrícula (D3).
 */
@Component({
  selector: 'aurora-sem-ligacao',
  imports: [Selo],
  templateUrl: './sem-ligacao.html',
  styleUrl: './sem-ligacao.scss',
})
export class SemLigacao {
  readonly unidade = input<string>();
  readonly competencia = input<string>();
  readonly situacao = input<SituacaoImovel>();
  readonly matricula = input<string>();

  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly downloads = inject(DownloadService);
  protected readonly sessao = inject(SessaoService);

  private readonly filtros = computed(() => ({
    ...(this.unidade() ? { unidade: this.unidade()! } : {}),
    ...(this.competencia() ? { competencia: this.competencia()! } : {}),
    ...(this.situacao() ? { situacao: this.situacao()! } : {}),
    ...(this.matricula() ? { matricula: this.matricula()! } : {}),
  }));

  protected readonly primeiraPagina = httpResource<DadosSemLigacao>(() => ({
    url: '/api/v1/imoveis/sem-ligacao',
    params: { ...this.filtros(), limite: LIMITE },
  }));

  protected readonly pagina = computed(() =>
    this.primeiraPagina.hasValue() ? this.primeiraPagina.value() : undefined,
  );

  /** Itens e cursor acumulados por "Carregar mais"; recomeçam quando a primeira página muda. */
  protected readonly itens = linkedSignal<ImovelSemLigacao[]>(() => this.pagina()?.itens ?? []);
  protected readonly proximo = linkedSignal<string | null>(() => this.pagina()?.proximo ?? null);
  protected readonly carregandoMais = signal(false);
  protected readonly exportando = signal(false);
  protected readonly erroExportacao = signal(false);

  protected readonly aba = computed<Aba>(() => this.situacao() ?? 'TODOS');
  protected readonly totalDaAba = computed(() => {
    const totais = this.pagina()?.totais;
    if (!totais) {
      return 0;
    }
    return { TODOS: totais.todos, FACTIVEL: totais.factiveis, CORTADO: totais.cortados }[this.aba()];
  });
  protected readonly naoEncontrado = computed(
    () => (this.primeiraPagina.error() as { status?: number } | undefined)?.status === 404,
  );

  protected readonly fmt = { numero, competenciaCurta, competenciaLonga };

  protected escolherAba(aba: Aba): void {
    this.filtrar({ situacao: aba === 'TODOS' ? null : aba });
  }

  protected buscar(valor: string): void {
    const limpo = valor.trim();
    this.filtrar({ matricula: /^[\p{L}\p{N}./-]{1,40}$/u.test(limpo) ? limpo : null });
  }

  protected async carregarMais(): Promise<void> {
    const cursor = this.proximo();
    if (!cursor || this.carregandoMais()) {
      return;
    }
    this.carregandoMais.set(true);
    try {
      const pagina = await firstValueFrom(
        this.http.get<DadosSemLigacao>('/api/v1/imoveis/sem-ligacao', {
          params: { ...this.filtros(), limite: LIMITE, cursor },
        }),
      );
      this.itens.update((atuais) => [...atuais, ...pagina.itens]);
      this.proximo.set(pagina.proximo);
    } finally {
      this.carregandoMais.set(false);
    }
  }

  protected async exportar(p: DadosSemLigacao): Promise<void> {
    this.exportando.set(true);
    this.erroExportacao.set(false);
    try {
      await this.downloads.baixar(
        '/api/v1/imoveis/sem-ligacao/exportacao.csv',
        {
          unidade: p.unidadeId,
          competencia: p.competencia,
          ...(this.situacao() ? { situacao: this.situacao()! } : {}),
        },
        `imoveis-sem-ligacao-${p.competencia}.csv`,
      );
    } catch {
      this.erroExportacao.set(true);
    } finally {
      this.exportando.set(false);
    }
  }

  /** "Sem ligação há" (RN-02). */
  protected tempoSemLigacao(item: ImovelSemLigacao): string {
    if (item.mesesSemLigacao == null) {
      return 'Nunca ligado';
    }
    return item.mesesSemLigacao === 1 ? '1 mês' : `${item.mesesSemLigacao} meses`;
  }

  /** Coluna "Origem": último mês ligado, ou desde quando aparece sem ligação. */
  protected origem(item: ImovelSemLigacao): string {
    return item.ultimoMesLigado
      ? `Ligado até ${competenciaCurta(item.ultimoMesLigado)}`
      : `Sem ligação desde ${competenciaCurta(item.primeiraCompetencia)}`;
  }

  private filtrar(params: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }
}
