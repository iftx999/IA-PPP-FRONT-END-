import { HttpClient, httpResource } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { type GeoJSONSource, Map as MapaLibre, NavigationControl, ScaleControl } from 'maplibre-gl';
import { firstValueFrom } from 'rxjs';
import type {
  DetalheLogradouro,
  ImovelDoLogradouro,
  LadoTrecho,
  TrechoLogradouro,
} from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { FUNDO_DO_MAPA } from '../../nucleo/fundo-mapa';
import { numero } from '../../nucleo/formato';
import { prepararMaplibre } from '../../nucleo/maplibre';
import { SessaoService } from '../../nucleo/sessao';
import { TemaService } from '../../nucleo/tema';
import { estiloBase, lerCores } from '../mapa/estilo-mapa';
import {
  ROTULO_LADO,
  ROTULO_PRECISAO,
  colecaoDosTrechos,
  enquadramento,
  extensao,
  faixaDoTrecho,
  nomeCompleto,
} from './textos';

/**
 * Detalhe do logradouro (ADR 0043, J3): trechos no mapa com a faixa de numeração, correção
 * do nome e das faixas (auditadas) e os imóveis na ordem da numeração. A matrícula vem inteira
 * só para quem pode ver dados pessoais.
 */
@Component({
  selector: 'aurora-logradouro',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './logradouro.html',
  styleUrls: ['../campanhas/campanhas.scss', './logradouros.scss', './logradouro.scss'],
})
export class LogradouroPagina {
  readonly id = input.required<string>();

  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly fundo = inject(FUNDO_DO_MAPA);
  private readonly tema = inject(TemaService);
  protected readonly sessao = inject(SessaoService);

  protected readonly podeGerir = computed(() => this.sessao.pode('logradouro:gerenciar'));
  protected readonly detalhe = httpResource<DetalheLogradouro>(() =>
    this.podeGerir() ? `/api/v1/logradouros/${this.id()}` : undefined,
  );
  protected readonly imoveis = httpResource<ImovelDoLogradouro[]>(() =>
    this.podeGerir() ? `/api/v1/logradouros/${this.id()}/imoveis` : undefined,
  );
  protected readonly fmt = { numero, extensao, faixaDoTrecho, nomeCompleto };
  protected readonly rotuloPrecisao = (p: string | null) =>
    p ? (ROTULO_PRECISAO[p] ?? p) : 'Sem ponto no mapa';
  protected readonly lados = Object.entries(ROTULO_LADO).map(([valor, rotulo]) => ({
    valor: valor as LadoTrecho,
    rotulo,
  }));
  protected readonly selecionado = signal<string | null>(null);

  // ----- Mapa -----
  private readonly recipiente = viewChild<ElementRef<HTMLElement>>('mapa');
  private mapa?: MapaLibre;

  constructor() {
    effect(() => {
      const elemento = this.recipiente()?.nativeElement;
      const dados = this.detalhe.hasValue() ? this.detalhe.value() : undefined;
      const escuro = this.tema.tema() === 'dark';
      if (!elemento || !dados) {
        return;
      }
      if (!this.mapa) {
        this.criarMapa(elemento, escuro);
      }
      this.desenhar(dados.trechos);
    });
    effect(() => {
      const id = this.selecionado();
      if (this.mapa?.getLayer('trechos-destaque')) {
        this.mapa.setFilter('trechos-destaque', ['==', ['get', 'id'], id ?? '']);
      }
    });
    inject(DestroyRef).onDestroy(() => this.mapa?.remove());
  }

  private criarMapa(elemento: HTMLElement, escuro: boolean): void {
    prepararMaplibre();
    const mapa = new MapaLibre({
      container: elemento,
      style: estiloBase(this.fundo, escuro),
      center: [-47.06, -22.9],
      zoom: 15,
      attributionControl: { compact: true },
    });
    mapa.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    mapa.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    new ResizeObserver(() => mapa.resize()).observe(elemento);
    mapa.on('click', 'trechos', (e) => {
      const id = e.features?.[0]?.properties?.['id'] as string | undefined;
      this.selecionado.set(id ?? null);
    });
    mapa.on('mouseenter', 'trechos', () => (mapa.getCanvas().style.cursor = 'pointer'));
    mapa.on('mouseleave', 'trechos', () => (mapa.getCanvas().style.cursor = ''));
    this.mapa = mapa;
  }

  private desenhar(trechos: TrechoLogradouro[]): void {
    const mapa = this.mapa!;
    const aplicar = () => {
      const cores = lerCores();
      const dados = colecaoDosTrechos(trechos);
      const fonte = mapa.getSource('trechos') as GeoJSONSource | undefined;
      if (fonte) {
        fonte.setData(dados);
      } else {
        mapa.addSource('trechos', { type: 'geojson', data: dados });
        mapa.addLayer({
          id: 'trechos',
          type: 'line',
          source: 'trechos',
          paint: { 'line-color': cores['--accent']!, 'line-width': 5, 'line-opacity': 0.85 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        mapa.addLayer({
          id: 'trechos-destaque',
          type: 'line',
          source: 'trechos',
          filter: ['==', ['get', 'id'], this.selecionado() ?? ''],
          paint: { 'line-color': cores['--warn']!, 'line-width': 8 },
          layout: { 'line-cap': 'round' },
        });
        mapa.addLayer({
          id: 'trechos-rotulo',
          type: 'symbol',
          source: 'trechos',
          layout: { 'symbol-placement': 'line', 'text-field': ['get', 'codigo'], 'text-size': 12 },
          paint: {
            'text-color': cores['--text-1']!,
            'text-halo-color': cores['--bg-0']!,
            'text-halo-width': 2,
          },
        });
      }
      const caixa = enquadramento(trechos);
      if (caixa) {
        mapa.fitBounds(caixa, { padding: 48, maxZoom: 18, duration: 0 });
      }
    };
    if (mapa.isStyleLoaded()) {
      aplicar();
    } else {
      mapa.once('load', aplicar);
    }
  }

  // ----- Correções -----
  private readonly modeloLogradouro = viewChild.required<TemplateRef<unknown>>('modeloLogradouro');
  private readonly modeloTrecho = viewChild.required<TemplateRef<unknown>>('modeloTrecho');
  private dialogo?: MatDialogRef<unknown>;
  protected readonly trechoEmEdicao = signal<TrechoLogradouro | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly formLogradouro = new FormGroup({
    tipo: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(30)] }),
    nome: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    bairro: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
  });
  protected readonly formTrecho = new FormGroup({
    numeroInicial: new FormControl<number | null>(null, Validators.min(0)),
    numeroFinal: new FormControl<number | null>(null, Validators.min(0)),
    lado: new FormControl<LadoTrecho>('AMBOS', { nonNullable: true }),
  });

  protected editarLogradouro(): void {
    const l = this.detalhe.value()?.logradouro;
    if (!l) {
      return;
    }
    this.erro.set(null);
    this.formLogradouro.reset({ tipo: l.tipo ?? '', nome: l.nome, bairro: l.bairro ?? '' });
    this.dialogo = this.dialogos.open(this.modeloLogradouro(), {
      width: '520px',
      maxWidth: '96vw',
    });
  }

  protected editarTrecho(t: TrechoLogradouro): void {
    this.erro.set(null);
    this.trechoEmEdicao.set(t);
    this.selecionado.set(t.id);
    this.formTrecho.reset({
      numeroInicial: t.numeroInicial,
      numeroFinal: t.numeroFinal,
      lado: t.lado,
    });
    this.dialogo = this.dialogos.open(this.modeloTrecho(), { width: '520px', maxWidth: '96vw' });
  }

  protected fechar(): void {
    this.dialogo?.close();
  }

  protected async salvarLogradouro(): Promise<void> {
    if (this.formLogradouro.invalid) {
      this.formLogradouro.markAllAsTouched();
      return;
    }
    const v = this.formLogradouro.getRawValue();
    await this.salvar(
      this.http.put<DetalheLogradouro>(`/api/v1/logradouros/${this.id()}`, {
        tipo: v.tipo.trim() || null,
        nome: v.nome.trim(),
        bairro: v.bairro.trim() || null,
      }),
    );
  }

  protected async salvarTrecho(): Promise<void> {
    const t = this.trechoEmEdicao();
    if (!t || this.formTrecho.invalid) {
      this.formTrecho.markAllAsTouched();
      return;
    }
    const v = this.formTrecho.getRawValue();
    const numeroOuNulo = (n: number | null) => (n == null || `${n}` === '' ? null : Number(n));
    await this.salvar(
      this.http.put<DetalheLogradouro>(`/api/v1/logradouros/trechos/${t.id}`, {
        numeroInicial: numeroOuNulo(v.numeroInicial),
        numeroFinal: numeroOuNulo(v.numeroFinal),
        lado: v.lado,
      }),
    );
  }

  private async salvar(pedido: ReturnType<HttpClient['put']>): Promise<void> {
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await firstValueFrom(pedido);
      this.dialogo?.close();
      this.detalhe.reload();
      this.imoveis.reload();
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
