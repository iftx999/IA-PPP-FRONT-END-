import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { LinhaUnidade, Meta, Painel as DadosPainel, Projecao } from '../../api/tipos';
import {
  competenciaCurta,
  competenciaLonga,
  numero,
  percentual,
  pontosPercentuais,
} from '../../nucleo/formato';
import { BarraAdesao } from '../../ui/barra-adesao';
import { SeloSituacao } from '../../ui/selo-situacao';
import { GraficoAdesao } from './grafico-adesao';

/**
 * Painel de adesão (épico B). A unidade e a competência ficam na URL (?unidade=&competencia=), então a tela pode
 * ser compartilhada e o "voltar" do navegador funciona.
 */
@Component({
  selector: 'aurora-painel',
  imports: [RouterLink, SeloSituacao, BarraAdesao, GraficoAdesao],
  templateUrl: './painel.html',
  styleUrl: './painel.scss',
})
export class Painel {
  /** Query params, ligados pelo roteador (withComponentInputBinding). */
  readonly unidade = input<string>();
  readonly competencia = input<string>();

  private readonly router = inject(Router);

  protected readonly dados = httpResource<DadosPainel>(() => ({
    url: '/api/v1/painel',
    params: {
      ...(this.unidade() ? { unidade: this.unidade()! } : {}),
      ...(this.competencia() ? { competencia: this.competencia()! } : {}),
    },
  }));

  /** Valor carregado (value() lança exceção em estado de erro). */
  protected readonly painel = computed(() => (this.dados.hasValue() ? this.dados.value() : undefined));
  protected readonly naoEncontrado = computed(
    () => (this.dados.error() as { status?: number } | undefined)?.status === 404,
  );
  protected readonly verComoTabela = signal(false);

  protected readonly fmt = { numero, percentual, pontosPercentuais, competenciaCurta, competenciaLonga };

  protected navegar(params: { unidade?: string; competencia?: string }): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }

  protected abrirUnidade(linha: LinhaUnidade): void {
    this.navegar({ unidade: linha.unidade.id });
  }

  protected metaDaLinha(meta: Meta | null): string {
    if (meta == null) {
      return 'Sem meta';
    }
    return meta.seguidaDe ? `Segue ${meta.seguidaDe.nome} · ${percentual(meta.valor)}` : percentual(meta.valor);
  }

  protected tendencia(valor: number | null): 'sobe' | 'desce' | 'estavel' {
    if (valor == null || Math.abs(valor) < 0.05) {
      return 'estavel';
    }
    return valor > 0 ? 'sobe' : 'desce';
  }

  /** Frase principal do quadro "No ritmo" (B2). */
  protected veredito(p: Projecao, metaPct: number): string {
    if (p.faltam === 0) {
      return 'Meta atingida nesta competência.';
    }
    if (p.prazo == null) {
      return p.mesAtingimento
        ? `No ritmo atual, a meta de ${percentual(metaPct)} sai em ${competenciaCurta(p.mesAtingimento)}.`
        : 'No ritmo atual, a meta não é alcançada.';
    }
    if (p.atinge) {
      return `No ritmo atual, a meta sai em ${competenciaCurta(p.mesAtingimento)}, dentro do prazo.`;
    }
    return `No ritmo atual, a meta não sai até ${competenciaCurta(p.prazo)}: projeção de ${percentual(p.projecaoNoPrazo)}.`;
  }
}
