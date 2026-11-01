import { Component, ElementRef, OnDestroy, effect, inject, input, viewChild } from '@angular/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import type { Simulacao } from '../../api/tipos';
import { competenciaCurta, percentual } from '../../nucleo/formato';
import { TemaService } from '../../nucleo/tema';
import { moeda, moedaCompacta } from './textos';

echarts.use([LineChart, BarChart, GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, SVGRenderer]);

function token(nome: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

/**
 * Adesão medida (12 meses) e projetada nos dois ritmos, meta e prazo; barras com a multa estimada do cenário em cada
 * aferição (eixo da direita).
 */
@Component({
  selector: 'aurora-grafico-simulacao',
  template: `<div #area class="area" role="img" [attr.aria-label]="'Gráfico da adesão projetada e da multa estimada'"></div>`,
  styles: `.area { width: 100%; height: 320px; }`,
})
export class GraficoSimulacao implements OnDestroy {
  readonly simulacao = input.required<Simulacao>();

  private readonly area = viewChild.required<ElementRef<HTMLDivElement>>('area');
  private readonly tema = inject(TemaService);
  private grafico?: echarts.ECharts;
  private readonly redimensionar = () => this.grafico?.resize();

  constructor() {
    effect(() => {
      this.tema.tema();
      this.desenhar(this.simulacao());
    });
    window.addEventListener('resize', this.redimensionar);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.redimensionar);
    this.grafico?.dispose();
  }

  private desenhar(s: Simulacao): void {
    this.grafico ??= echarts.init(this.area().nativeElement, undefined, { renderer: 'svg' });
    const historico = s.serie.slice(0, -1);
    const projetados = s.cenario.meses;
    const eixo = [...historico.map((m) => m.competencia), ...projetados.map((m) => m.competencia)];
    const antes = historico.map(() => null);
    const medida = [
      ...historico.map((m) => (m.ligados * 100) / m.comRede),
      projetados[0]!.adesao,
      ...projetados.slice(1).map(() => null),
    ];
    const texto = token('--text-3');
    const linha = token('--line');
    const temMulta = s.regras.length > 0;

    this.grafico.setOption(
      {
        animationDuration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600,
        textStyle: { fontFamily: token('--font-ui') },
        grid: { left: 48, right: temMulta ? 64 : 16, top: 36, bottom: 28 },
        legend: { top: 0, left: 0, textStyle: { color: token('--text-2') }, icon: 'roundRect', itemHeight: 3 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: token('--bg-3'),
          borderColor: linha,
          textStyle: { color: token('--text-1') },
        },
        xAxis: {
          type: 'category',
          data: eixo,
          axisLabel: { color: texto, formatter: (c: string) => competenciaCurta(c) },
          axisLine: { lineStyle: { color: linha } },
        },
        yAxis: [
          {
            type: 'value',
            scale: true,
            axisLabel: { color: texto, formatter: (v: number) => `${v}%` },
            splitLine: { lineStyle: { color: linha } },
          },
          ...(temMulta
            ? [{ type: 'value', axisLabel: { color: texto, formatter: moedaCompacta }, splitLine: { show: false } }]
            : []),
        ],
        series: [
          {
            name: 'Adesão medida',
            type: 'line',
            data: medida,
            color: token('--accent-2'),
            symbolSize: 6,
            lineStyle: { width: 2 },
            tooltip: { valueFormatter: (v: unknown) => (typeof v === 'number' ? percentual(v) : '—') },
          },
          {
            name: 'Ritmo atual',
            type: 'line',
            data: [...antes, ...s.ritmoAtualProjetado.meses.map((m) => m.adesao)],
            color: token('--neutral'),
            showSymbol: false,
            lineStyle: { type: 'dashed', width: 2 },
            tooltip: { valueFormatter: (v: unknown) => (typeof v === 'number' ? percentual(v) : '—') },
          },
          {
            name: 'Cenário',
            type: 'line',
            data: [...antes, ...projetados.map((m) => m.adesao)],
            color: token('--accent'),
            showSymbol: false,
            lineStyle: { width: 2.5 },
            tooltip: { valueFormatter: (v: unknown) => (typeof v === 'number' ? percentual(v) : '—') },
            markLine: s.meta?.prazo
              ? {
                  symbol: 'none',
                  silent: true,
                  label: { formatter: 'Prazo', color: texto },
                  lineStyle: { color: token('--warn'), type: 'dotted' },
                  data: [{ xAxis: s.meta.prazo }],
                }
              : undefined,
          },
          {
            name: 'Meta',
            type: 'line',
            data: eixo.map(() => s.meta?.valor ?? null),
            color: token('--ok'),
            showSymbol: false,
            lineStyle: { type: 'dashed', width: 1.5 },
            tooltip: { valueFormatter: (v: unknown) => (typeof v === 'number' ? percentual(v) : '—') },
          },
          ...(temMulta
            ? [
                {
                  name: 'Multa estimada (cenário)',
                  type: 'bar',
                  yAxisIndex: 1,
                  barMaxWidth: 14,
                  data: [...antes, ...projetados.map((m) => (m.multa > 0 ? m.multa : null))],
                  color: token('--danger'),
                  itemStyle: { opacity: 0.55, borderRadius: [3, 3, 0, 0] },
                  tooltip: { valueFormatter: (v: unknown) => (typeof v === 'number' ? moeda(v) : '—') },
                },
              ]
            : []),
        ],
      },
      true,
    );
  }
}
