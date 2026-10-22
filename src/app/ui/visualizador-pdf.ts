import { Component, ElementRef, computed, effect, input, signal, untracked, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

/** Retângulo de destaque em % do tamanho da página (acompanha qualquer zoom). */
export interface Destaque {
  esquerda: number;
  topo: number;
  largura: number;
  altura: number;
}

/** Trecho de texto da página: o texto e onde ele começa na concatenação normalizada. */
export interface PedacoDeTexto {
  texto: string;
  /** [x, y, largura, altura] no espaço do PDF (origem embaixo à esquerda). */
  caixa: [number, number, number, number];
}

/** Sem acento, minúsculo e espaços colapsados: o texto do PDF quebra linhas em lugares imprevisíveis. */
export function normalizarParaBusca(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
}

/**
 * Índices dos pedaços que cobrem o trecho procurado (busca no texto da página concatenado).
 * Vazio se o trecho não estiver na página.
 */
export function pedacosDoTrecho(pedacos: PedacoDeTexto[], trecho: string): number[] {
  const procurado = normalizarParaBusca(trecho);
  if (procurado.length < 6) {
    return [];
  }
  let texto = '';
  const inicios: number[] = [];
  for (const p of pedacos) {
    const parte = normalizarParaBusca(p.texto);
    inicios.push(texto.length + (texto ? 1 : 0));
    texto = texto ? `${texto} ${parte}` : parte;
  }
  const inicio = texto.indexOf(procurado);
  if (inicio < 0) {
    return [];
  }
  const fim = inicio + procurado.length;
  return pedacos
    .map((p, i) => ({ i, de: inicios[i]!, ate: inicios[i]! + normalizarParaBusca(p.texto).length }))
    .filter(({ de, ate }) => ate > inicio && de < fim && ate > de)
    .map(({ i }) => i);
}

/**
 * Mostra uma página de PDF com pdf.js e destaca o trecho citado (A3/A4: revisar o item ao lado da fonte).
 * Recebe os bytes já baixados com o token; o pdf.js é carregado só quando o componente aparece.
 */
@Component({
  selector: 'aurora-visualizador-pdf',
  imports: [MatButtonModule, MatProgressSpinnerModule],
  template: `
    <div class="barra">
      <button matIconButton type="button" (click)="ir(paginaAtual() - 1)" [disabled]="paginaAtual() <= 1" aria-label="Página anterior">
        <span class="material-symbols-rounded">chevron_left</span>
      </button>
      <span class="dado" aria-live="polite">Página {{ paginaAtual() }} de {{ totalPaginas() || '…' }}</span>
      <button matIconButton type="button" (click)="ir(paginaAtual() + 1)" [disabled]="paginaAtual() >= totalPaginas()" aria-label="Próxima página">
        <span class="material-symbols-rounded">chevron_right</span>
      </button>
      <span class="espaco"></span>
      @if (destaque()) {
        <span class="situacao" [class.achou]="destaques().length > 0">
          <span class="material-symbols-rounded" aria-hidden="true">{{ destaques().length ? 'ink_highlighter' : 'search_off' }}</span>
          {{ destaques().length ? 'Trecho destacado' : 'Trecho não encontrado nesta página' }}
        </span>
      }
      <button matIconButton type="button" (click)="zoom.set(zoom() - 0.25)" [disabled]="zoom() <= 0.75" aria-label="Diminuir zoom">
        <span class="material-symbols-rounded">zoom_out</span>
      </button>
      <button matIconButton type="button" (click)="zoom.set(zoom() + 0.25)" [disabled]="zoom() >= 2.5" aria-label="Aumentar zoom">
        <span class="material-symbols-rounded">zoom_in</span>
      </button>
    </div>
    <div class="area" #area>
      @if (erro()) {
        <p class="aviso">Não foi possível mostrar o PDF.</p>
      } @else {
        <div class="pagina" [style.width.px]="larguraPagina()">
          <canvas #tela role="img" [attr.aria-label]="'Página ' + paginaAtual() + ' do PDF'"></canvas>
          @for (d of destaques(); track $index) {
            <span class="destaque" [style.left.%]="d.esquerda" [style.top.%]="d.topo" [style.width.%]="d.largura" [style.height.%]="d.altura"></span>
          }
        </div>
        @if (carregando()) {
          <div class="carregando"><mat-spinner diameter="28" /></div>
        }
      }
    </div>
  `,
  styles: `
    :host { display: grid; grid-template-rows: auto 1fr; height: 100%; min-height: 0; background: var(--bg-3); }
    .barra { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-bottom: var(--border); background: var(--bg-2);
      font-size: var(--fs-small); color: var(--text-2); }
    .espaco { flex: 1; }
    .situacao { display: inline-flex; align-items: center; gap: 4px; margin-right: 8px; color: var(--warn); font-size: var(--fs-label);
      .material-symbols-rounded { font-size: 16px; } }
    .situacao.achou { color: var(--accent); }
    .area { position: relative; overflow: auto; padding: 16px; min-height: 0; }
    .pagina { position: relative; margin: 0 auto; box-shadow: 0 2px 12px rgba(0, 0, 0, .35); background: #fff; }
    canvas { display: block; width: 100%; height: auto; }
    .destaque { position: absolute; background: rgba(255, 213, 0, .38); mix-blend-mode: multiply; border-radius: 2px;
      outline: 1px solid rgba(214, 160, 0, .6); pointer-events: none; }
    .carregando { position: absolute; inset: 0; display: grid; place-items: center; }
    .aviso { color: var(--text-3); text-align: center; margin-top: 48px; }
  `,
})
export class VisualizadorPdf {
  /** Bytes do PDF. */
  readonly dados = input<ArrayBuffer | null>(null);
  /** Página a mostrar (1 = primeira); mudar a entrada leva o visualizador até ela. */
  readonly pagina = input(1);
  /** Texto a destacar na página atual. */
  readonly destaque = input<string | null>(null);

  private readonly area = viewChild.required<ElementRef<HTMLElement>>('area');
  private readonly tela = viewChild<ElementRef<HTMLCanvasElement>>('tela');

  protected readonly paginaAtual = signal(1);
  protected readonly totalPaginas = signal(0);
  protected readonly zoom = signal(1);
  protected readonly carregando = signal(false);
  protected readonly erro = signal(false);
  protected readonly destaques = signal<Destaque[]>([]);
  private readonly larguraArea = signal(600);
  protected readonly larguraPagina = computed(() => Math.max(200, (this.larguraArea() - 32) * this.zoom()));

  private carregamento: PDFDocumentLoadingTask | null = null;
  private documento: PDFDocumentProxy | null = null;
  private tarefa: RenderTask | null = null;
  private readonly versao = signal(0);

  constructor() {
    effect((limpar) => {
      const dados = this.dados();
      untracked(() => void this.abrir(dados));
      limpar(() => {
        void this.carregamento?.destroy();
        this.carregamento = null;
        this.documento = null;
      });
    });
    effect(() => this.paginaAtual.set(Math.max(1, this.pagina())));
    effect(() => {
      // Redesenha ao mudar página, zoom, largura, destaque ou documento.
      this.paginaAtual();
      this.larguraPagina();
      this.destaque();
      this.versao();
      untracked(() => void this.desenhar());
    });
    effect((limpar) => {
      const observador = new ResizeObserver(([entrada]) => this.larguraArea.set(entrada!.contentRect.width));
      observador.observe(this.area().nativeElement);
      limpar(() => observador.disconnect());
    });
  }

  protected ir(pagina: number): void {
    this.paginaAtual.set(Math.min(Math.max(1, pagina), this.totalPaginas() || 1));
  }

  private async abrir(dados: ArrayBuffer | null): Promise<void> {
    this.erro.set(false);
    this.totalPaginas.set(0);
    if (!dados) {
      return;
    }
    this.carregando.set(true);
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      // Cópia: o pdf.js transfere o buffer para o worker e ele ficaria inutilizável aqui.
      this.carregamento = pdfjs.getDocument({ data: new Uint8Array(dados.slice(0)) });
      this.documento = await this.carregamento.promise;
      this.totalPaginas.set(this.documento.numPages);
      this.versao.update((v) => v + 1);
    } catch {
      this.erro.set(true);
    } finally {
      this.carregando.set(false);
    }
  }

  private async desenhar(): Promise<void> {
    const documento = this.documento;
    const tela = this.tela()?.nativeElement;
    if (!documento || !tela) {
      return;
    }
    const numero = Math.min(this.paginaAtual(), documento.numPages);
    this.tarefa?.cancel();
    try {
      const pagina = await documento.getPage(numero);
      const base = pagina.getViewport({ scale: 1 });
      const escala = (this.larguraPagina() / base.width) * (window.devicePixelRatio || 1);
      const viewport = pagina.getViewport({ scale: escala });
      tela.width = Math.floor(viewport.width);
      tela.height = Math.floor(viewport.height);
      this.tarefa = pagina.render({ canvas: tela, viewport });
      await this.tarefa.promise;
      this.destaques.set(await this.calcularDestaques(pagina, this.destaque()));
    } catch (erro) {
      if ((erro as { name?: string }).name !== 'RenderingCancelledException') {
        this.erro.set(true);
      }
    }
  }

  private async calcularDestaques(pagina: PDFPageProxy, trecho: string | null): Promise<Destaque[]> {
    if (!trecho) {
      return [];
    }
    const conteudo = await pagina.getTextContent();
    const pedacos: PedacoDeTexto[] = conteudo.items
      .filter((i): i is typeof i & { str: string; transform: number[]; width: number; height: number } => 'str' in i)
      .map((i) => ({ texto: i.str, caixa: [i.transform[4]!, i.transform[5]!, i.width, i.height] }));
    const [x0, y0, x1, y1] = pagina.view as [number, number, number, number];
    const largura = x1 - x0;
    const altura = y1 - y0;
    return pedacosDoTrecho(pedacos, trecho).map((i) => {
      const [xAbs, yAbs, w, h] = pedacos[i]!.caixa;
      const x = xAbs - x0;
      const y = yAbs - y0;
      // Origem do PDF embaixo; a tela, em cima. Um pouco de folga vertical para cobrir acentos.
      return {
        esquerda: (x / largura) * 100,
        topo: ((altura - y - h * 1.15) / altura) * 100,
        largura: (w / largura) * 100,
        altura: ((h * 1.35) / altura) * 100,
      };
    });
  }
}
