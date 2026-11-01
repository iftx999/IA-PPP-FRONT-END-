import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import type { Simulacao } from '../../api/tipos';
import { competenciaCurta, competenciaLonga, numero, percentual, pontosPercentuais } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { Selo } from '../../ui/selo';
import { GraficoSimulacao } from './grafico-simulacao';
import { comparacao, descreverRegra, moeda, veredito } from './textos';

/** Opções de horizonte depois do prazo (meses). */
const HORIZONTES = [0, 6, 12, 24, 36, 60];

/**
 * Simulador de penalidades (ADR 0035). Unidade, ritmo e horizonte ficam na URL (?unidade=&ligacoes=&meses=): a
 * simulação pode ser compartilhada e o "voltar" do navegador funciona. Sempre uma estimativa.
 */
@Component({
  selector: 'aurora-simulador',
  imports: [
    RouterLink, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatSliderModule, MatTableModule, Selo, GraficoSimulacao,
  ],
  templateUrl: './simulador.html',
  styleUrl: './simulador.scss',
})
export class Simulador {
  readonly unidade = input<string>();
  readonly ligacoes = input<string>();
  readonly meses = input<string>();

  protected readonly sessao = inject(SessaoService);
  private readonly router = inject(Router);

  protected readonly dados = httpResource<Simulacao>(() =>
    this.sessao.pode('indicador:ler')
      ? {
          url: '/api/v1/simulador',
          params: {
            ...(this.unidade() ? { unidade: this.unidade()! } : {}),
            ...(this.ligacoes() ? { ligacoesPorMes: this.ligacoes()! } : {}),
            ...(this.meses() ? { mesesAposPrazo: this.meses()! } : {}),
          },
        }
      : undefined,
  );

  protected readonly simulacao = computed(() => (this.dados.hasValue() ? this.dados.value() : undefined));
  protected readonly naoEncontrado = computed(() => (this.dados.error() as { status?: number } | undefined)?.status === 404);

  /** Valor do controle enquanto se arrasta (a URL só muda ao soltar ou confirmar). */
  protected readonly rascunho = signal<number | null>(null);
  protected readonly ritmoNaTela = computed(() => this.rascunho() ?? this.simulacao()?.cenario.ligacoesPorMes ?? 0);

  /** Fim da escala do controle: folga sobre o maior ritmo de referência. */
  protected readonly maximoDoControle = computed(() => {
    const s = this.simulacao();
    if (!s) {
      return 100;
    }
    const referencia = Math.max(s.ritmoAtual ?? 0, s.ligacoesNecessariasPorMes ?? 0, s.cenario.ligacoesPorMes, 10);
    const bruto = referencia * 2;
    const passo = 10 ** Math.max(0, Math.floor(Math.log10(bruto)) - 1);
    return Math.ceil(bruto / passo) * passo;
  });

  protected readonly verMesAMes = signal(false);
  protected readonly colunas = ['competencia', 'ligados', 'adesao', 'abaixo', 'multa', 'multaAtual'];
  protected readonly horizontes = HORIZONTES;

  /** Linhas da tabela mês a mês: cenário e ritmo atual lado a lado. */
  protected readonly linhas = computed(() => {
    const s = this.simulacao();
    if (!s) {
      return [];
    }
    return s.cenario.meses.map((m, i) => ({ ...m, multaAtual: s.ritmoAtualProjetado.meses[i]?.multa ?? 0 }));
  });

  protected readonly fmt = {
    numero, percentual, pontosPercentuais, competenciaCurta, competenciaLonga, moeda, descreverRegra, veredito, comparacao,
  };

  protected aplicarRitmo(valor: number | string | null): void {
    const n = typeof valor === 'string' ? Number(valor.replace(/\./g, '').replace(',', '.')) : valor;
    this.rascunho.set(null);
    if (n == null || !Number.isFinite(n) || n < 0) {
      return;
    }
    this.navegar({ ligacoes: String(Math.round(n)) });
  }

  protected navegar(params: { unidade?: string | null; ligacoes?: string | null; meses?: string | null }): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }

  /** Trocar de unidade volta ao ritmo padrão (o necessário para a meta dela). */
  protected trocarUnidade(id: string): void {
    this.navegar({ unidade: id, ligacoes: null });
  }

  protected horizonteDe(): number {
    return this.meses() ? Number(this.meses()) : 12;
  }

  protected rotuloHorizonte(meses: number): string {
    return meses === 0 ? 'Só até o prazo' : `${meses} meses após o prazo`;
  }
}
