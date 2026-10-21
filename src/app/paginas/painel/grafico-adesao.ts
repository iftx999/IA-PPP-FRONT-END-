import { Component, ElementRef, OnDestroy, effect, inject, input, viewChild } from '@angular/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import type { Meta, PontoSerie, Projecao } from '../../api/tipos';
import { competenciaCurta, percentual } from '../../nucleo/formato';
import { TemaService } from '../../nucleo/tema';

echarts.use([LineChart, BarChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

/** Lê um token de cor do CSS: o gráfico segue o tema sem cores fixas (docs/07, 7.9). */
function token(nome: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

function somarMeses(competencia: string, meses: number): string {
  const [ano, mes] = competencia.split('-').map(Number);
  const data = new Date(Date.UTC(ano!, mes! - 1 + meses, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Série histórica (B3): adesão (linha cheia), projeção no ritmo atual até o prazo (tracejada), meta (tracejada)
 * e limite de alerta (pontilhada).
 */
@Component({
  selector: 'aurora-grafico-adesao',
  template: `<div #area class="area" role="img" [attr.aria-label]="'Gráfico da adesão mensal'"></div>`,
  styles: `.area { width: 100%; height: 280px; }`,
})
export class GraficoAdesao implements OnDestroy {
  readonly serie = input.required<PontoSerie[]>();
  readonly meta = input<Meta | null>(null);
  readonly projecao = input<Projecao | null>(null);

  private readonly area = viewChild.required<ElementRef<HTMLDivElement>>('area');
  private readonly tema = inject(TemaService);
  private grafico?: echarts.ECharts;
  private readonly redimensionar = () => this.grafico?.resize();

  constructor() {
    effect(() => {
      this.tema.tema(); // redesenha ao trocar o tema
      this.desenhar(this.serie(), this.meta(), this.projecao());
    });
    window.addEventListener('resize', this.redimensionar);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.redimensionar);
    this.grafico?.dispose();
  }

  private desenhar(serie: PontoSerie[], meta: Meta | null, projecao: Projecao | null): void {
    if (serie.length === 0) {
      return;
    }
    this.grafico ??= echarts.init(this.area().nativeElement, undefined, { renderer: 'svg' });

    const ultimo = serie[serie.length - 1]!;
    const meses = projecao?.mesesRestantes ?? 0;
    const futuros = Array.from({ length: meses }, (_, i) => somarMeses(ultimo.competencia, i + 1));
    const eixo = [...serie.map((p) => p.competencia), ...futuros];

    const ritmo = Math.max(0, projecao?.ritmoAtual ?? 0);
    const projetada: (number | null)[] = eixo.map((_, i) => {
      const k = i - (serie.length - 1);
      if (k < 0 || projecao == null || meses === 0) {
        return null;
      }
      return Math.min(100, ((ultimo.ligados + ritmo * k) / ultimo.comRede) * 100);
    });

    const constante = (valor: number | null | undefined) => eixo.map(() => valor ?? null);
    const texto = token('--text-3');
    const linha = token('--line');

    this.grafico.setOption(
      {
        animationDuration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600,
        textStyle: { fontFamily: token('--font-ui') },
        grid: { left: 48, right: 16, top: 36, bottom: 28 },
        legend: { top: 0, left: 0, textStyle: { color: token('--text-2') }, icon: 'roundRect', itemHeight: 3 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: token('--bg-3'),
          borderColor: linha,
          textStyle: { color: token('--text-1') },
          valueFormatter: (v: unknown) => (typeof v === 'number' ? percentual(v) : '—'),
        },
        xAxis: {
          type: 'category',
          data: eixo,
          axisLabel: { color: texto, formatter: (c: string) => competenciaCurta(c) },
          axisLine: { lineStyle: { color: linha } },
        },
        yAxis: {
          type: 'value',
          scale: true,
          axisLabel: { color: texto, formatter: (v: number) => `${v}%` },
          splitLine: { lineStyle: { color: linha } },
        },
        series: [
          {
            name: 'Adesão',
            type: 'line',
            data: [...serie.map((p) => p.percentual), ...futuros.map(() => null)],
            color: token('--accent-2'),
            symbolSize: 6,
            lineStyle: { width: 2 },
          },
          {
            name: 'Projeção',
            type: 'line',
            data: projetada,
            color: token('--accent-2'),
            showSymbol: false,
            lineStyle: { type: 'dashed', width: 2, opacity: 0.7 },
          },
          {
            name: 'Meta',
            type: 'line',
            data: constante(meta?.valor),
            color: token('--ok'),
            showSymbol: false,
            lineStyle: { type: 'dashed', width: 1.5 },
          },
          {
            name: 'Limite de alerta',
            type: 'line',
            data: constante(meta?.alerta),
            color: token('--warn'),
            showSymbol: false,
            lineStyle: { type: 'dotted', width: 1.5 },
          },
        ],
      },
      true,
    );
  }
}
