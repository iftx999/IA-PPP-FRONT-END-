import { HttpClient, httpResource } from '@angular/common/http';
import {
  Component, DestroyRef, ElementRef, TemplateRef, afterRenderEffect, computed, effect, inject, input, signal, untracked,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import {
  type GeoJSONSource, Map as MapaLibre, type MapGeoJSONFeature, type MapMouseEvent, NavigationControl, ScaleControl,
  type VectorTileSource, setWorkerUrl,
} from 'maplibre-gl';
import type { Point } from 'geojson';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { firstValueFrom } from 'rxjs';
import type {
  CamadasMapa, ImovelNoPonto, MarcacaoMapa, MunicipioMapa, PedidoExportacaoMapa, PedidoMarcacao, SituacaoNoMapa,
} from '../../api/tipos';
import { DownloadService } from '../../nucleo/download';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { competenciaLonga, data, percentual } from '../../nucleo/formato';
import { FUNDO_DO_MAPA } from '../../nucleo/fundo-mapa';
import { SessaoService } from '../../nucleo/sessao';
import { TemaService } from '../../nucleo/tema';
import { SeloSituacao } from '../../ui/selo-situacao';
import {
  CAMADAS_DO_GRUPO, CAMADAS_PADRAO, type Camadas, PREFIXO_AGRUPAMENTO, SITUACOES, SITUACOES_MUNICIPIO, areaVisivel,
  camadasDaAurora, colecoes, estiloBase, iconeAgrupamento, iconeCasa, iconeCasaAproximada, iconeEstacao, iconePino,
  lerCores, pinturaDoFundo, raioDoClique, urlDosTiles,
} from './estilo-mapa';

type Grupo = keyof typeof CAMADAS_DO_GRUPO;
type PropriedadeDePintura = Parameters<MapaLibre['setPaintProperty']>[1];

type Selecao =
  | { tipo: 'municipio'; municipio: MunicipioMapa }
  | { tipo: 'imoveis'; carregando: boolean; imoveis: ImovelNoPonto[]; erro?: string }
  | { tipo: 'marcacao'; marcacao: MarcacaoMapa }
  | { tipo: 'operacional'; nome: string; descricao: string };

/** Abaixo deste zoom as marcações não são buscadas (a área seria grande demais para ler). */
const ZOOM_MARCACOES = 11;

/** A imagem do mapa vai no PDF com até 2000 px de largura (a API aceita até 4096). */
const LARGURA_IMAGEM = 2000;

/**
 * Mapa (épico E): municípios pela adesão, setores, rede, imóveis por situação, estações e marcações; vista 3D,
 * marcar local e exportar a área visível. Imóveis e rede vêm por tiles vetoriais da API (ADR 0017), com o token.
 */
@Component({
  selector: 'aurora-mapa',
  imports: [
    ReactiveFormsModule, RouterLink, MatButtonModule, MatCheckboxModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatMenuModule, MatProgressSpinnerModule, MatSelectModule, MatTooltipModule, SeloSituacao,
  ],
  templateUrl: './mapa.html',
  styleUrl: './mapa.scss',
  host: { '(document:keydown.escape)': 'cancelarMarcacao()' },
})
export class Mapa {
  readonly competencia = input<string>();
  /** Vista inicial por link (ex.: /mapa?lon=-47.39&lat=-22.55&zoom=16); sem ela, enquadra o escopo. */
  readonly lon = input(undefined, { transform: numeroOuNada });
  readonly lat = input(undefined, { transform: numeroOuNada });
  readonly zoom = input(undefined, { transform: numeroOuNada });

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly oidc = inject(OidcSecurityService);
  private readonly dialogos = inject(MatDialog);
  private readonly downloads = inject(DownloadService);
  private readonly tema = inject(TemaService);
  private readonly fundo = inject(FUNDO_DO_MAPA);
  protected readonly sessao = inject(SessaoService);

  private readonly recipiente = viewChild<ElementRef<HTMLElement>>('recipiente');
  private readonly modeloMarcacao = viewChild.required<TemplateRef<unknown>>('modeloMarcacao');

  protected readonly dados = httpResource<CamadasMapa>(() => {
    if (!this.sessao.pode('indicador:ler')) {
      return undefined;
    }
    const competencia = this.competencia();
    const params: Record<string, string> = competencia ? { competencia } : {};
    return { url: '/api/v1/mapa/camadas', params };
  });
  protected readonly camadasMapa = computed(() => (this.dados.hasValue() ? this.dados.value() : undefined));
  protected readonly competenciaAtual = computed(() => this.camadasMapa()?.competencia ?? null);

  protected readonly camadas = signal<Camadas>({ ...CAMADAS_PADRAO, situacoes: [...CAMADAS_PADRAO.situacoes] });
  protected readonly vista3d = signal(false);
  protected readonly marcando = signal(false);
  protected readonly selecao = signal<Selecao | null>(null);
  protected readonly zoomAtual = signal(0);
  protected readonly painelAberto = signal(true);
  protected readonly exportando = signal<'CSV' | 'PDF' | null>(null);
  protected readonly erroExportacao = signal<string | null>(null);
  protected readonly mapaPronto = signal(false);
  protected readonly erroDoMapa = signal(false);

  protected readonly situacoes = SITUACOES;
  protected readonly situacoesMunicipio = SITUACOES_MUNICIPIO;
  protected readonly fmt = { competenciaLonga, percentual, data };
  protected readonly podeMarcar = computed(() => this.sessao.pode('mapa:marcar'));
  protected readonly podeExportar = computed(() => this.sessao.pode('relatorio:exportar'));
  protected readonly aproximeParaVer = computed(() => {
    const dados = this.camadasMapa();
    return !!dados && this.camadas().imoveis && this.zoomAtual() < dados.zoomImoveis;
  });

  // ----- Marcar local -----
  protected readonly formMarcacao = new FormGroup({
    titulo: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(80)] }),
    observacao: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });
  protected readonly pontoDaMarcacao = signal<{ longitude: number; latitude: number } | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erroMarcacao = signal<string | null>(null);
  private dialogo?: MatDialogRef<unknown>;

  private mapa?: MapaLibre;
  private enquadrado = false;
  private marcacoes: MarcacaoMapa[] = [];
  private municipioEmDestaque: number | string | null = null;
  private pedidoMarcacoes = 0;
  private temporizadorMarcacoes?: ReturnType<typeof setTimeout>;

  constructor() {
    // O recipiente só existe depois que a sessão carrega (o @if da página): cria o mapa quando ele aparece.
    afterRenderEffect(() => {
      const recipiente = this.recipiente()?.nativeElement;
      if (recipiente && !this.mapa) {
        untracked(() => this.criarMapa(recipiente));
      }
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.temporizadorMarcacoes);
      this.mapa?.remove();
    });

    // Camadas leves: chegam (ou mudam de competência) e vão para as fontes GeoJSON.
    effect(() => {
      const dados = this.camadasMapa();
      if (!dados || !this.mapaPronto()) {
        return;
      }
      untracked(() => this.aplicarDados(dados));
    });
    // Filtros de imóveis e rede mudam a URL dos tiles; grupos ligam e desligam camadas.
    effect(() => {
      const camadas = this.camadas();
      const competencia = this.competenciaAtual();
      if (!this.mapaPronto()) {
        return;
      }
      untracked(() => this.aplicarCamadas(camadas, competencia));
    });
    effect(() => {
      this.tema.tema();
      if (this.mapaPronto()) {
        untracked(() => this.aplicarTema());
      }
    });
    effect(() => {
      const canvas = this.mapa?.getCanvas();
      if (canvas && this.mapaPronto()) {
        canvas.style.cursor = this.marcando() ? 'crosshair' : '';
      }
    });
  }

  // ----- Ações da barra -----

  protected escolherCompetencia(competencia: string): void {
    void this.router.navigate([], { queryParams: { competencia }, queryParamsHandling: 'merge' });
  }

  protected alternarVista(): void {
    const tresD = !this.vista3d();
    this.vista3d.set(tresD);
    this.mapa?.easeTo({ pitch: tresD ? 60 : 0, bearing: tresD ? -20 : 0, duration: 800 });
  }

  protected alternarMarcacao(): void {
    this.marcando.update((v) => !v);
  }

  protected cancelarMarcacao(): void {
    if (this.marcando()) {
      this.marcando.set(false);
    }
  }

  protected ligar(grupo: Grupo, ligado: boolean): void {
    this.camadas.update((c) => ({ ...c, [grupo]: ligado }));
  }

  protected ligarSituacao(situacao: SituacaoNoMapa, ligado: boolean): void {
    this.camadas.update((c) => ({
      ...c,
      situacoes: ligado ? [...new Set([...c.situacoes, situacao])] : c.situacoes.filter((s) => s !== situacao),
    }));
  }

  protected ligarAproximadas(ligado: boolean): void {
    this.camadas.update((c) => ({ ...c, aproximadas: ligado }));
  }

  protected enquadrar(): void {
    const area = this.camadasMapa()?.enquadramento;
    if (area && this.mapa) {
      this.mapa.fitBounds([[area.oeste, area.sul], [area.leste, area.norte]], { padding: 48, duration: 600 });
    }
  }

  protected fecharSelecao(): void {
    this.selecao.set(null);
    this.mostrarSelecao(null);
  }

  /** E5: exporta o que está visível (área atual e camadas ligadas); a emissão fica na auditoria. */
  protected async exportar(formato: 'CSV' | 'PDF'): Promise<void> {
    const mapa = this.mapa;
    if (!mapa || this.exportando()) {
      return;
    }
    const camadas = this.camadas();
    const imoveisVisiveis = camadas.imoveis && camadas.situacoes.length > 0;
    const pedido: PedidoExportacaoMapa = {
      formato,
      area: areaVisivel(mapa.getBounds()),
      imoveis: imoveisVisiveis
        ? { competencia: this.competenciaAtual(), situacoes: camadas.situacoes, aproximadas: camadas.aproximadas }
        : null,
      marcacoes: camadas.marcacoes,
      imagemPng: formato === 'PDF' ? await this.imagemDoMapa(mapa) : null,
    };
    this.exportando.set(formato);
    this.erroExportacao.set(null);
    try {
      await this.downloads.baixarComCorpo('/api/v1/mapa/exportacao', pedido,
        `area-do-mapa.${formato === 'PDF' ? 'pdf' : 'csv'}`);
    } catch (falha) {
      this.erroExportacao.set(await mensagemDoBlob(falha));
    } finally {
      this.exportando.set(null);
    }
  }

  protected async salvarMarcacao(): Promise<void> {
    const ponto = this.pontoDaMarcacao();
    if (!ponto || this.formMarcacao.invalid) {
      this.formMarcacao.markAllAsTouched();
      return;
    }
    const valor = this.formMarcacao.getRawValue();
    const pedido: PedidoMarcacao = { ...ponto, titulo: valor.titulo, observacao: valor.observacao || null };
    this.salvando.set(true);
    this.erroMarcacao.set(null);
    try {
      const criada = await firstValueFrom(this.http.post<MarcacaoMapa>('/api/v1/mapa/marcacoes', pedido));
      this.dialogo?.close();
      this.marcando.set(false);
      this.carregarMarcacoes();
      this.selecionar({ tipo: 'marcacao', marcacao: criada }, [criada.longitude, criada.latitude]);
    } catch (falha) {
      this.erroMarcacao.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async removerMarcacao(marcacao: MarcacaoMapa): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`/api/v1/mapa/marcacoes/${marcacao.id}`));
      this.fecharSelecao();
      this.carregarMarcacoes();
    } catch (falha) {
      this.erroExportacao.set(mensagemDeErro(falha));
    }
  }

  protected fecharDialogo(): void {
    this.dialogo?.close();
  }

  protected rotuloSituacao(situacao: SituacaoNoMapa): string {
    return SITUACOES.find((s) => s.codigo === situacao)?.rotulo ?? situacao;
  }

  protected corDaSituacao(situacao: SituacaoNoMapa): string {
    return `var(${SITUACOES.find((s) => s.codigo === situacao)?.token ?? '--neutral'})`;
  }

  protected rotuloPrecisao(imovel: ImovelNoPonto): string {
    return { ENDERECO: 'Endereço exato', LOGRADOURO: 'Pela rua (aproximada)', BAIRRO: 'Pelo bairro (aproximada)',
      MANUAL: 'Marcada à mão' }[imovel.precisao];
  }

  // ----- Mapa -----

  private criarMapa(recipiente: HTMLElement): void {
    garantirEstilosDoMapa();
    setWorkerUrl(new URL('/maplibre/maplibre-gl-worker.mjs', window.location.origin).href);
    const [lon, lat, zoom] = [this.lon(), this.lat(), this.zoom()];
    const vistaPedida = lon != null && lat != null && Math.abs(lon) <= 180 && Math.abs(lat) <= 90;
    this.enquadrado = vistaPedida;
    const mapa = new MapaLibre({
      container: recipiente,
      style: estiloBase(this.fundo, this.tema.tema() === 'dark'),
      center: vistaPedida ? [lon, lat] : [-47.5, -22.63],
      zoom: vistaPedida ? Math.min(Math.max(zoom ?? 15, 3), 19) : 10,
      maxPitch: 70,
      attributionControl: { compact: true },
      transformRequest: (url) => (url.startsWith(`${window.location.origin}/api/`)
        ? { url, headers: { Authorization: `Bearer ${this.tokenAtual()}` } }
        : { url }),
    });
    this.mapa = mapa;
    mapa.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
    mapa.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    new ResizeObserver(() => mapa.resize()).observe(recipiente);

    mapa.setMissingStyleImageResolver((id) => this.desenharAgrupamento(id));
    mapa.on('error', (e) => console.warn('[Aurora] mapa', e.error?.message));
    mapa.on('load', () => {
      this.registrarIcones();
      const vazio = { type: 'FeatureCollection' as const, features: [] };
      for (const fonte of ['municipios', 'setores', 'operacionais', 'marcacoes', 'selecao']) {
        mapa.addSource(fonte, { type: 'geojson', data: vazio });
      }
      mapa.addSource('aurora', {
        type: 'vector', tiles: [urlDosTiles(window.location.origin, this.competenciaAtual(), this.camadas())],
        minzoom: 8, maxzoom: 16,
      });
      const dados = this.camadasMapa();
      for (const camada of camadasDaAurora(lerCores(), this.tema.tema() === 'dark', dados?.zoomImoveis ?? 15,
        dados?.zoomRede ?? 12)) {
        mapa.addLayer(camada);
      }
      this.zoomAtual.set(mapa.getZoom());
      this.registrarInteracao(mapa);
      this.mapaPronto.set(true);
    });
    mapa.once('error', () => {
      if (!this.mapaPronto()) {
        this.erroDoMapa.set(true);
      }
    });
  }

  private aplicarDados(dados: CamadasMapa): void {
    const mapa = this.mapa!;
    const colecao = colecoes(dados);
    (mapa.getSource('municipios') as GeoJSONSource).setData(colecao.municipios);
    (mapa.getSource('setores') as GeoJSONSource).setData(colecao.setores);
    (mapa.getSource('operacionais') as GeoJSONSource).setData(colecao.operacionais);
    if (!this.enquadrado && dados.enquadramento) {
      this.enquadrado = true;
      const a = dados.enquadramento;
      mapa.fitBounds([[a.oeste, a.sul], [a.leste, a.norte]], { padding: 48, duration: 0 });
    }
    this.carregarMarcacoes();
  }

  private aplicarCamadas(camadas: Camadas, competencia: string | null): void {
    const mapa = this.mapa!;
    (mapa.getSource('aurora') as VectorTileSource).setTiles([urlDosTiles(window.location.origin, competencia, camadas)]);
    for (const [grupo, ids] of Object.entries(CAMADAS_DO_GRUPO) as [Grupo, string[]][]) {
      const visivel = grupo === 'imoveis' ? camadas.imoveis && camadas.situacoes.length > 0 : camadas[grupo];
      for (const id of ids) {
        mapa.setLayoutProperty(id, 'visibility', visivel ? 'visible' : 'none');
      }
    }
  }

  private aplicarTema(): void {
    const mapa = this.mapa!;
    const escuro = this.tema.tema() === 'dark';
    for (const [propriedade, valor] of Object.entries(pinturaDoFundo(escuro))) {
      mapa.setPaintProperty('fundo', propriedade as PropriedadeDePintura, valor);
    }
    const dados = this.camadasMapa();
    for (const camada of camadasDaAurora(lerCores(), escuro, dados?.zoomImoveis ?? 15, dados?.zoomRede ?? 12)) {
      for (const [propriedade, valor] of Object.entries(camada.paint ?? {})) {
        mapa.setPaintProperty(camada.id, propriedade as PropriedadeDePintura, valor);
      }
    }
    // Ícones coloridos (não SDF) e agrupamentos são redesenhados com as cores novas.
    const cores = lerCores();
    mapa.updateImage('pino', iconePino(cores));
    mapa.updateImage('estacao', iconeEstacao(cores));
    for (const id of mapa.listImages().filter((i) => i.startsWith(PREFIXO_AGRUPAMENTO))) {
      mapa.updateImage(id, iconeAgrupamento(id.slice(PREFIXO_AGRUPAMENTO.length), cores, fonteDosDados()));
    }
  }

  private registrarIcones(): void {
    const mapa = this.mapa!;
    const cores = lerCores();
    mapa.addImage('casa', iconeCasa(), { sdf: true, pixelRatio: 2 });
    mapa.addImage('casa-aproximada', iconeCasaAproximada(), { sdf: true, pixelRatio: 2 });
    mapa.addImage('pino', iconePino(cores), { pixelRatio: 2 });
    mapa.addImage('estacao', iconeEstacao(cores), { pixelRatio: 2 });
  }

  private desenharAgrupamento(id: string): void {
    if (id.startsWith(PREFIXO_AGRUPAMENTO) && this.mapa && !this.mapa.hasImage(id)) {
      this.mapa.addImage(id, iconeAgrupamento(id.slice(PREFIXO_AGRUPAMENTO.length), lerCores(), fonteDosDados()),
        { pixelRatio: 2 });
    }
  }

  private registrarInteracao(mapa: MapaLibre): void {
    const clicaveis = ['marcacoes', 'operacionais', 'imoveis', 'agrupamentos', 'municipios-preenchimento'];
    mapa.on('zoomend', () => this.zoomAtual.set(mapa.getZoom()));
    mapa.on('moveend', () => this.agendarMarcacoes());
    mapa.on('mousemove', (e) => {
      if (this.marcando()) {
        return;
      }
      const alvo = mapa.queryRenderedFeatures(e.point, { layers: clicaveis.filter((c) => mapa.getLayer(c)) })[0];
      mapa.getCanvas().style.cursor = alvo && alvo.layer.id !== 'municipios-preenchimento' ? 'pointer' : '';
      const municipio = alvo?.layer.id === 'municipios-preenchimento' ? alvo.id ?? null : null;
      if (municipio !== this.municipioEmDestaque) {
        if (this.municipioEmDestaque != null) {
          mapa.setFeatureState({ source: 'municipios', id: this.municipioEmDestaque }, { destaque: false });
        }
        if (municipio != null) {
          mapa.setFeatureState({ source: 'municipios', id: municipio }, { destaque: true });
        }
        this.municipioEmDestaque = municipio;
      }
    });
    mapa.on('click', (e) => this.clicar(mapa, e, clicaveis));
  }

  private clicar(mapa: MapaLibre, e: MapMouseEvent, clicaveis: string[]): void {
    if (this.marcando()) {
      this.abrirMarcacao(e.lngLat.lng, e.lngLat.lat);
      return;
    }
    const alvo: MapGeoJSONFeature | undefined = mapa.queryRenderedFeatures(e.point, {
      layers: clicaveis.filter((c) => mapa.getLayer(c) && mapa.getLayoutProperty(c, 'visibility') !== 'none'),
    })[0];
    if (!alvo) {
      this.fecharSelecao();
      return;
    }
    const camada = alvo.layer.id;
    if (camada === 'agrupamentos') {
      mapa.easeTo({ center: e.lngLat, zoom: Math.min(mapa.getZoom() + 2, 16) });
    } else if (camada === 'marcacoes') {
      const id = alvo.properties['id'] as string;
      const marcacao = this.marcacoes.find((m) => m.id === id);
      if (marcacao) {
        this.selecionar({ tipo: 'marcacao', marcacao }, [marcacao.longitude, marcacao.latitude]);
      }
    } else if (camada === 'operacionais') {
      const p = alvo.properties;
      const tipo = p['tipo'] === 'ETE' ? 'Estação de tratamento de esgoto' : 'Estação elevatória de esgoto';
      this.selecionar({ tipo: 'operacional', nome: p['nome'] as string, descricao: tipo },
        (alvo.geometry as Point).coordinates as [number, number]);
    } else if (camada === 'imoveis') {
      void this.buscarImoveis(e.lngLat.lng, e.lngLat.lat);
    } else {
      const municipio = this.camadasMapa()?.municipios.find((m) => m.unidadeId === alvo.properties['unidadeId']);
      if (municipio) {
        this.selecionar({ tipo: 'municipio', municipio }, null);
      }
    }
  }

  private async buscarImoveis(longitude: number, latitude: number): Promise<void> {
    const mapa = this.mapa!;
    const camadas = this.camadas();
    this.selecionar({ tipo: 'imoveis', carregando: true, imoveis: [] }, [longitude, latitude]);
    const params: Record<string, string | string[]> = {
      longitude: String(longitude), latitude: String(latitude),
      raio: String(raioDoClique(mapa.getZoom(), latitude)),
      situacoes: camadas.situacoes, aproximadas: String(camadas.aproximadas),
    };
    if (this.competenciaAtual()) {
      params['competencia'] = this.competenciaAtual()!;
    }
    try {
      const imoveis = await firstValueFrom(this.http.get<ImovelNoPonto[]>('/api/v1/mapa/imoveis', { params }));
      this.selecao.set({ tipo: 'imoveis', carregando: false, imoveis });
      if (imoveis[0]) {
        this.mostrarSelecao([imoveis[0].longitude, imoveis[0].latitude]);
      }
    } catch (falha) {
      this.selecao.set({ tipo: 'imoveis', carregando: false, imoveis: [], erro: mensagemDeErro(falha) });
    }
  }

  private selecionar(selecao: Selecao, ponto: [number, number] | null): void {
    this.selecao.set(selecao);
    this.mostrarSelecao(ponto);
  }

  private mostrarSelecao(ponto: [number, number] | null): void {
    (this.mapa?.getSource('selecao') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: ponto ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: ponto }, properties: {} }] : [],
    });
  }

  private abrirMarcacao(longitude: number, latitude: number): void {
    this.pontoDaMarcacao.set({ longitude: arredondar(longitude), latitude: arredondar(latitude) });
    this.formMarcacao.reset();
    this.erroMarcacao.set(null);
    this.dialogo = this.dialogos.open(this.modeloMarcacao(), { width: '460px' });
  }

  // ----- Marcações da área -----

  private agendarMarcacoes(): void {
    clearTimeout(this.temporizadorMarcacoes);
    this.temporizadorMarcacoes = setTimeout(() => this.carregarMarcacoes(), 250);
  }

  private carregarMarcacoes(): void {
    const mapa = this.mapa;
    if (!mapa || !this.mapaPronto() || !this.sessao.pode('indicador:ler')) {
      return;
    }
    const fonte = mapa.getSource('marcacoes') as GeoJSONSource;
    if (mapa.getZoom() < ZOOM_MARCACOES) {
      this.marcacoes = [];
      fonte.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const area = areaVisivel(mapa.getBounds());
    const pedido = ++this.pedidoMarcacoes;
    this.http.get<MarcacaoMapa[]>('/api/v1/mapa/marcacoes', {
      params: { oeste: area.oeste, sul: area.sul, leste: area.leste, norte: area.norte },
    }).subscribe({
      next: (marcacoes) => {
        if (pedido !== this.pedidoMarcacoes) {
          return;
        }
        this.marcacoes = marcacoes;
        fonte.setData({
          type: 'FeatureCollection',
          features: marcacoes.map((m) => ({
            type: 'Feature', geometry: { type: 'Point', coordinates: [m.longitude, m.latitude] },
            properties: { id: m.id },
          })),
        });
      },
      error: () => undefined,
    });
  }

  // ----- Apoio -----

  /** Token atual (a biblioteca o entrega de forma síncrona a partir do armazenamento da sessão). */
  private tokenAtual(): string {
    let token = '';
    this.oidc.getAccessToken().subscribe((t) => (token = t)).unsubscribe();
    return token;
  }

  /**
   * Imagem do mapa como a pessoa o vê, reduzida para o PDF. Copiada dentro do próprio quadro de renderização
   * (sem preserveDrawingBuffer, que pesa em todo quadro).
   */
  private imagemDoMapa(mapa: MapaLibre): Promise<string | null> {
    return new Promise((pronto) => {
      mapa.once('render', () => {
        const origem = mapa.getCanvas();
        const escala = Math.min(1, LARGURA_IMAGEM / origem.width);
        const destino = document.createElement('canvas');
        destino.width = Math.round(origem.width * escala);
        destino.height = Math.round(origem.height * escala);
        destino.getContext('2d')!.drawImage(origem, 0, 0, destino.width, destino.height);
        try {
          pronto(destino.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''));
        } catch {
          pronto(null); // fundo de outro domínio sem CORS: o PDF sai só com as listas
        }
      });
      mapa.triggerRepaint();
    });
  }
}

function garantirEstilosDoMapa(): void {
  if (!document.querySelector('link[data-maplibre]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'maplibre.css';
    link.dataset['maplibre'] = '';
    document.head.appendChild(link);
  }
}

function numeroOuNada(valor: string | number | undefined): number | undefined {
  const numero = typeof valor === 'string' ? Number(valor) : valor;
  return numero != null && Number.isFinite(numero) ? numero : undefined;
}

function arredondar(valor: number): number {
  return Math.round(valor * 1e6) / 1e6;
}

function fonteDosDados(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--font-data').trim() || 'monospace';
}

/** Erros de download chegam como Blob: lê o Problem Details para mostrar a mensagem da API. */
async function mensagemDoBlob(falha: unknown): Promise<string> {
  const corpo = (falha as { error?: unknown }).error;
  if (corpo instanceof Blob) {
    try {
      const problema = JSON.parse(await corpo.text()) as { detail?: string };
      if (problema.detail) {
        return problema.detail;
      }
    } catch {
      // sem corpo legível: mensagem padrão
    }
  }
  return mensagemDeErro(falha, 'Não foi possível exportar a área. Tente novamente.');
}
