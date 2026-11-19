import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  type GeoJSONSource,
  LngLatBounds,
  Map as MapaLibre,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl';
import { firstValueFrom } from 'rxjs';
import type {
  CandidatasDaRota,
  Prioridade,
  Roteirizacao as DadosRoteirizacao,
  RotaDaEquipe,
  Unidade,
} from '../../api/tipos';
import { deIso, paraIso } from '../../nucleo/datas';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { filtrosNaUrl } from '../../nucleo/filtros';
import { FUNDO_DO_MAPA } from '../../nucleo/fundo-mapa';
import { numero } from '../../nucleo/formato';
import { prepararMaplibre } from '../../nucleo/maplibre';
import { SessaoService } from '../../nucleo/sessao';
import { TemaService } from '../../nucleo/tema';
import { FiltroUnidade } from '../../ui/filtro-unidade';
import { Selo, type Tom } from '../../ui/selo';
import { ROTULO_PRIORIDADE } from '../campanhas/textos';
import { estiloBase, lerCores } from '../mapa/estilo-mapa';
import {
  ROTULO_SEM_ROTA,
  ROTULO_SITUACAO,
  type Fixacoes,
  alternarFixacao,
  corDaRota,
  duracao,
  fixacoesIniciais,
  hora,
  km,
  moverPara,
  mudou,
  pedidoDeRecalculo,
} from './textos';

const CONSULTA_MS = 1500;

/**
 * Roteirização (J6, J7; ADR 0046): escolher equipes e OS de um dia, calcular as rotas
 * (assíncrono), ajustar fixando ou movendo OS, recalcular e publicar como programação.
 * Tudo é estimativa (RN-25).
 */
@Component({
  selector: 'aurora-roteirizacao',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    FiltroUnidade,
    Selo,
  ],
  templateUrl: './roteirizacao.html',
  styleUrls: ['../campanhas/campanhas.scss', './roteirizacao.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Roteirizacao {
  private readonly http = inject(HttpClient);
  private readonly avisos = inject(MatSnackBar);
  private readonly fundo = inject(FUNDO_DO_MAPA);
  private readonly tema = inject(TemaService);
  protected readonly sessao = inject(SessaoService);

  protected readonly podeProgramar = computed(() => this.sessao.pode('os:programar'));
  protected readonly filtros = filtrosNaUrl(['unidade', 'data', 'id']);
  protected readonly fmt = { numero, hora, duracao, km };
  protected readonly rotuloSemRota = ROTULO_SEM_ROTA;
  protected readonly rotuloSituacao = ROTULO_SITUACAO;

  protected readonly unidades = httpResource<Unidade[]>(() =>
    this.podeProgramar() ? '/api/v1/unidades' : undefined,
  );
  /** Unidade escolhida; sem escolha, a mais alta do escopo. */
  protected readonly unidade = computed(() => {
    const escolhida = this.filtros.valor('unidade');
    if (escolhida) {
      return escolhida;
    }
    const lista = this.unidades.hasValue() ? this.unidades.value() : [];
    const ids = new Set(lista.map((u) => u.id));
    return lista.find((u) => !u.unidadePaiId || !ids.has(u.unidadePaiId))?.id ?? null;
  });
  protected readonly data = computed(() => this.filtros.valor('data') ?? paraIso(new Date())!);
  protected readonly campoData = new FormControl<Date | null>(new Date());

  protected readonly candidatas = httpResource<CandidatasDaRota>(() => {
    const unidade = this.unidade();
    return this.podeProgramar() && unidade && !this.filtros.valor('id')
      ? { url: '/api/v1/roteirizacoes/candidatas', params: { unidade, data: this.data() } }
      : undefined;
  });
  protected readonly equipesEscolhidas = signal<ReadonlySet<string>>(new Set());
  protected readonly ordensEscolhidas = signal<ReadonlySet<string>>(new Set());

  protected readonly atual = signal<DadosRoteirizacao | null>(null);
  protected readonly calculando = computed(() => this.atual()?.situacao === 'CALCULANDO');
  protected readonly ocupado = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly fixacoes = signal<Fixacoes>(new Map());
  private fixacoesDoCalculo: Fixacoes = new Map();
  protected readonly ajustado = computed(() => mudou(this.fixacoesDoCalculo, this.fixacoes()));
  protected readonly selecionada = signal<string | null>(null);
  protected readonly totalNasRotas = computed(
    () => this.atual()?.rotas.reduce((s, r) => s + r.paradas.length, 0) ?? 0,
  );

  private readonly elementoMapa = viewChild<ElementRef<HTMLElement>>('mapa');
  private mapa?: MapaLibre;
  private consulta?: ReturnType<typeof setTimeout>;

  constructor() {
    // Candidatas novas: marca todas as equipes com base e todas as OS com local.
    effect(() => {
      if (!this.candidatas.hasValue()) {
        return;
      }
      const c = this.candidatas.value();
      this.equipesEscolhidas.set(new Set(c.equipes.filter((e) => e.temBase).map((e) => e.id)));
      this.ordensEscolhidas.set(new Set(c.ordens.filter((o) => o.temLocal).map((o) => o.id)));
    });
    effect(() => {
      const id = this.filtros.valor('id');
      if (id) {
        void this.carregar(id);
      } else {
        this.atual.set(null);
      }
    });
    effect(() => this.campoData.setValue(deIso(this.data()), { emitEvent: false }));
    effect(() => {
      const elemento = this.elementoMapa()?.nativeElement;
      const r = this.atual();
      const escuro = this.tema.tema() === 'dark';
      if (!elemento || !r || r.situacao === 'CALCULANDO') {
        this.mapa?.remove();
        this.mapa = undefined;
        return;
      }
      if (!this.mapa || this.mapa.getContainer() !== elemento) {
        this.mapa?.remove();
        this.criarMapa(elemento, escuro);
      }
      this.desenhar(r.rotas);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.consulta);
      this.mapa?.remove();
    });
  }

  protected escolherUnidade(id: string | null): void {
    this.filtros.aplicar({ unidade: id, id: null });
  }

  protected escolherData(data: Date | null): void {
    if (data) {
      this.filtros.aplicar({ data: paraIso(data), id: null });
    }
  }

  protected alternar(conjunto: 'equipes' | 'ordens', id: string): void {
    const alvo = conjunto === 'equipes' ? this.equipesEscolhidas : this.ordensEscolhidas;
    alvo.update((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(id)) {
        novo.add(id);
      }
      return novo;
    });
  }

  protected todasAsOrdens(marcar: boolean): void {
    const c = this.candidatas.hasValue() ? this.candidatas.value() : null;
    this.ordensEscolhidas.set(
      new Set(marcar && c ? c.ordens.filter((o) => o.temLocal).map((o) => o.id) : []),
    );
  }

  protected async calcular(): Promise<void> {
    await this.pedir(() =>
      this.http.post<DadosRoteirizacao>('/api/v1/roteirizacoes', {
        unidadeId: this.unidade(),
        data: this.data(),
        equipes: [...this.equipesEscolhidas()],
        ordens: [...this.ordensEscolhidas()],
      }),
    );
  }

  protected async recalcular(): Promise<void> {
    const r = this.atual();
    if (r) {
      await this.pedir(() =>
        this.http.post<DadosRoteirizacao>(
          `/api/v1/roteirizacoes/${r.id}/recalcular`,
          pedidoDeRecalculo(this.fixacoes()),
        ),
      );
    }
  }

  protected async publicar(): Promise<void> {
    const r = this.atual();
    if (!r) {
      return;
    }
    await this.pedir(() =>
      this.http.post<DadosRoteirizacao>(`/api/v1/roteirizacoes/${r.id}/publicar`, {}),
    );
    if (this.atual()?.situacao === 'PUBLICADA') {
      this.avisos.open(
        `${numero(this.totalNasRotas())} OS programadas na ordem das rotas. As equipes já veem no app.`,
        'Ok',
        { duration: 6000 },
      );
    }
  }

  protected async descartar(): Promise<void> {
    const r = this.atual();
    if (r) {
      await this.pedir(() =>
        this.http.post<DadosRoteirizacao>(`/api/v1/roteirizacoes/${r.id}/descartar`, {}),
      );
    }
  }

  protected novaRoteirizacao(): void {
    this.filtros.aplicar({ id: null });
  }

  protected fixar(ordemServicoId: string): void {
    this.fixacoes.update((f) => alternarFixacao(f, this.atual()?.rotas ?? [], ordemServicoId));
  }

  protected mover(ordemServicoId: string, equipeId: string): void {
    this.fixacoes.update((f) => moverPara(f, ordemServicoId, equipeId));
  }

  protected fixadaEm(ordemServicoId: string): string | null {
    return this.fixacoes().get(ordemServicoId)?.equipeId ?? null;
  }

  protected nomeDaEquipe(id: string): string {
    return this.atual()?.rotas.find((r) => r.equipeId === id)?.equipeNome ?? '';
  }

  protected prioridade(valor: string): { texto: string; tom: Tom } {
    return ROTULO_PRIORIDADE[valor as Prioridade] ?? { texto: valor, tom: 'neutro' };
  }

  protected cor(indice: number): string {
    return `var(${corDaRota(indice)})`;
  }

  protected focar(rota: RotaDaEquipe): void {
    this.selecionada.set(this.selecionada() === rota.equipeId ? null : rota.equipeId);
    const pontos = pontosDa(rota);
    if (this.mapa && pontos.length) {
      this.mapa.fitBounds(limites(pontos), { padding: 48, maxZoom: 16, duration: 400 });
    }
  }

  /** Envia o pedido e acompanha até o cálculo terminar. */
  private async pedir(chamada: () => ReturnType<HttpClient['post']>): Promise<void> {
    this.ocupado.set(true);
    this.erro.set(null);
    try {
      const r = (await firstValueFrom(chamada())) as DadosRoteirizacao;
      this.filtros.aplicar({ id: r.id, data: r.data, unidade: r.unidadeId });
      this.aplicar(r);
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.ocupado.set(false);
    }
  }

  private async carregar(id: string): Promise<void> {
    clearTimeout(this.consulta);
    try {
      this.aplicar(
        await firstValueFrom(this.http.get<DadosRoteirizacao>(`/api/v1/roteirizacoes/${id}`)),
      );
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    }
  }

  private aplicar(r: DadosRoteirizacao): void {
    const anterior = this.atual();
    this.atual.set(r);
    if (anterior?.id !== r.id || anterior.situacao !== r.situacao) {
      this.fixacoesDoCalculo = fixacoesIniciais(r.rotas);
      this.fixacoes.set(new Map(this.fixacoesDoCalculo));
    }
    clearTimeout(this.consulta);
    if (r.situacao === 'CALCULANDO') {
      this.consulta = setTimeout(() => void this.carregar(r.id), CONSULTA_MS);
    }
  }

  private criarMapa(elemento: HTMLElement, escuro: boolean): void {
    prepararMaplibre();
    const mapa = new MapaLibre({
      container: elemento,
      style: estiloBase(this.fundo, escuro),
      center: [-47.4, -22.6],
      zoom: 11,
      attributionControl: { compact: true },
    });
    mapa.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    mapa.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    new ResizeObserver(() => mapa.resize()).observe(elemento);
    this.mapa = mapa;
  }

  private desenhar(rotas: readonly RotaDaEquipe[]): void {
    const mapa = this.mapa!;
    const aplicar = () => {
      const estilo = getComputedStyle(document.documentElement);
      const cores = rotas.map((_, i) => estilo.getPropertyValue(corDaRota(i)).trim() || '#888888');
      const base = lerCores();
      const linhas = colecao(
        rotas.flatMap((r, i) =>
          linhasDa(r).map((coordenadas) => ({
            type: 'Feature' as const,
            properties: { cor: cores[i], estimada: r.tracado.length === 0 },
            geometry: { type: 'LineString' as const, coordinates: coordenadas },
          })),
        ),
      );
      const paradas = colecao(
        rotas.flatMap((r, i) =>
          r.paradas
            .filter((p) => p.local)
            .map((p) => ({
              type: 'Feature' as const,
              properties: { cor: cores[i], rotulo: String(p.ordem) },
              geometry: {
                type: 'Point' as const,
                coordinates: [p.local!.longitude, p.local!.latitude],
              },
            })),
        ),
      );
      const partidas = colecao(
        rotas
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => r.partida)
          .map(({ r, i }) => ({
            type: 'Feature' as const,
            properties: { cor: cores[i], rotulo: r.equipeNome },
            geometry: {
              type: 'Point' as const,
              coordinates: [r.partida!.longitude, r.partida!.latitude],
            },
          })),
      );
      const fonte = mapa.getSource('rotas') as GeoJSONSource | undefined;
      if (fonte) {
        fonte.setData(linhas);
        (mapa.getSource('paradas') as GeoJSONSource).setData(paradas);
        (mapa.getSource('partidas') as GeoJSONSource).setData(partidas);
      } else {
        mapa.addSource('rotas', { type: 'geojson', data: linhas });
        mapa.addSource('paradas', { type: 'geojson', data: paradas });
        mapa.addSource('partidas', { type: 'geojson', data: partidas });
        for (const estimada of [false, true]) {
          mapa.addLayer({
            id: estimada ? 'rotas-estimadas' : 'rotas',
            type: 'line',
            source: 'rotas',
            filter: ['==', ['get', 'estimada'], estimada],
            paint: {
              'line-color': ['get', 'cor'],
              'line-width': 4,
              'line-opacity': 0.9,
              ...(estimada ? { 'line-dasharray': [2, 2] } : {}),
            },
            layout: { 'line-cap': estimada ? 'butt' : 'round', 'line-join': 'round' },
          });
        }
        mapa.addLayer({
          id: 'partidas',
          type: 'circle',
          source: 'partidas',
          paint: {
            'circle-radius': 9,
            'circle-color': base['--bg-0']!,
            'circle-stroke-color': ['get', 'cor'],
            'circle-stroke-width': 4,
          },
        });
        mapa.addLayer({
          id: 'paradas',
          type: 'circle',
          source: 'paradas',
          paint: {
            'circle-radius': 11,
            'circle-color': ['get', 'cor'],
            'circle-stroke-color': base['--bg-0']!,
            'circle-stroke-width': 2,
          },
        });
        mapa.addLayer({
          id: 'paradas-rotulo',
          type: 'symbol',
          source: 'paradas',
          layout: { 'text-field': ['get', 'rotulo'], 'text-size': 11, 'text-allow-overlap': true },
          paint: { 'text-color': base['--bg-0']! },
        });
      }
      const pontos = rotas.flatMap(pontosDa);
      if (pontos.length) {
        mapa.fitBounds(limites(pontos), { padding: 48, maxZoom: 15, duration: 0 });
      }
    };
    if (mapa.isStyleLoaded()) {
      aplicar();
    } else {
      mapa.once('load', aplicar);
    }
  }
}

type Coordenada = [number, number];

/** Traçado pela malha ou, sem ele, segmentos retos entre a partida e as paradas. */
function linhasDa(rota: RotaDaEquipe): Coordenada[][] {
  if (rota.tracado.length) {
    return rota.tracado.map((linha) => linha.map((p) => [p[0]!, p[1]!] as Coordenada));
  }
  const pontos = pontosDa(rota);
  return pontos.length > 1 ? [pontos] : [];
}

function pontosDa(rota: RotaDaEquipe): Coordenada[] {
  const pontos: Coordenada[] = [];
  if (rota.partida) {
    pontos.push([rota.partida.longitude, rota.partida.latitude]);
  }
  for (const p of rota.paradas) {
    if (p.local) {
      pontos.push([p.local.longitude, p.local.latitude]);
    }
  }
  return pontos;
}

function limites(pontos: Coordenada[]): LngLatBounds {
  return pontos.reduce((b, p) => b.extend(p), new LngLatBounds(pontos[0]!, pontos[0]!));
}

function colecao<F>(features: F[]): { type: 'FeatureCollection'; features: F[] } {
  return { type: 'FeatureCollection', features };
}
