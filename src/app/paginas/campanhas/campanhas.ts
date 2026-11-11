import { HttpClient, httpResource } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type ValidatorFn,
} from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom, merge } from 'rxjs';
import type {
  AcaoCampanha,
  Campanha,
  OrigemCampanha,
  PedidoCampanha,
  PreviaCampanha,
  RecorteCampanha,
  StatusCampanha,
  Unidade,
} from '../../api/tipos';
import { paraIso } from '../../nucleo/datas';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { filtrosNaUrl } from '../../nucleo/filtros';
import { competenciaLonga, data, numero, percentual } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import {
  arvoreDeUnidades,
  filtrarUnidades,
  semAcento,
  subarvore,
  type OpcaoUnidade,
} from '../../nucleo/unidades-arvore';
import { FiltroUnidade } from '../../ui/filtro-unidade';
import { Selo } from '../../ui/selo';
import {
  ROTULO_ACAO,
  ROTULO_ORIGEM,
  ROTULO_STATUS_CAMPANHA,
  etapasDoFunil,
  frasesDoImpacto,
} from './textos';

const daLista: ValidatorFn = (c) =>
  c.value && typeof c.value === 'object' ? null : { daLista: true };

/** Área do mapa vinda da URL (botão "Campanha nesta área" do mapa). */
interface AreaDaUrl {
  oeste: number;
  sul: number;
  leste: number;
  norte: number;
}

/**
 * Campanhas de ligação (I2, ADR 0036). "Nova campanha" monta o recorte (lista de sem ligação, setor ou área do mapa),
 * mostra a prévia com o impacto na meta e cria as OS. O recorte pode chegar pela URL (vindo de Sem ligação ou do
 * Mapa): ?origem=&unidade=&situacao=&motivoCorte=&oeste=&sul=&leste=&norte= abre o diálogo já preenchido.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'aurora-campanhas',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    FiltroUnidade,
    Selo,
  ],
  templateUrl: './campanhas.html',
  styleUrl: './campanhas.scss',
})
export class Campanhas {
  readonly origem = input<string>();
  readonly unidade = input<string>();
  readonly situacao = input<string>();
  readonly motivoCorte = input<string>();
  readonly oeste = input<string>();
  readonly sul = input<string>();
  readonly leste = input<string>();
  readonly norte = input<string>();

  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly router = inject(Router);
  protected readonly sessao = inject(SessaoService);

  protected readonly podeGerir = computed(() => this.sessao.pode('campanha:gerenciar'));
  // ----- Filtros da lista (na URL; "unidade" já é do recorte da nova campanha) -----
  protected readonly filtros = filtrosNaUrl(['busca', 'status', 'acao', 'filtroUnidade']);
  protected readonly busca = new FormControl(this.filtros.inicial('busca'), { nonNullable: true });
  protected readonly filtroStatus = computed(
    () => (this.filtros.valor('status') as StatusCampanha | 'TODAS' | null) ?? 'ATIVA',
  );
  protected readonly filtroAcao = computed(() => this.filtros.valor('acao') as AcaoCampanha | null);
  protected readonly filtroUnidade = computed(() => this.filtros.valor('filtroUnidade'));
  /** Filtros além da situação (que tem as abas próprias). */
  protected readonly filtrando = computed(
    () => !!this.filtros.valor('busca') || !!this.filtroAcao() || !!this.filtroUnidade(),
  );
  protected readonly visiveis = computed(() => {
    if (!this.dados.hasValue()) {
      return undefined;
    }
    const t = semAcento((this.filtros.valor('busca') ?? '').trim());
    const acao = this.filtroAcao();
    const id = this.filtroUnidade();
    const unidades =
      id && this.dadosUnidades.hasValue()
        ? new Set(subarvore(this.dadosUnidades.value(), id).map((u) => u.id))
        : null;
    return this.dados
      .value()
      .filter(
        (c) =>
          (!t || semAcento(`${c.nome} ${c.unidadeNome}`).includes(t)) &&
          (!acao || c.acao === acao) &&
          (!id || (unidades ? unidades.has(c.unidadeId) : c.unidadeId === id)),
      );
  });
  protected readonly dados = httpResource<Campanha[]>(() =>
    this.podeGerir()
      ? {
          url: '/api/v1/campanhas',
          params: (this.filtroStatus() === 'TODAS'
            ? {}
            : { status: this.filtroStatus() }) as Record<string, string>,
        }
      : undefined,
  );
  protected readonly dadosUnidades = httpResource<Unidade[]>(() =>
    this.podeGerir() && this.sessao.pode('unidade:ler') ? '/api/v1/unidades' : undefined,
  );

  protected readonly fmt = { numero, percentual, data, competenciaLonga };
  protected readonly rotuloStatus = ROTULO_STATUS_CAMPANHA;
  protected readonly rotuloOrigem = ROTULO_ORIGEM;
  protected readonly rotuloAcao = ROTULO_ACAO;
  protected readonly acoes: AcaoCampanha[] = ['LIGACAO', 'VISTORIA', 'NOTIFICACAO'];
  protected readonly etapas = etapasDoFunil;

  // ----- Nova campanha -----
  private readonly modeloNova = viewChild.required<TemplateRef<unknown>>('modeloNova');
  private dialogo?: MatDialogRef<unknown>;
  protected readonly area = signal<AreaDaUrl | null>(null);
  protected readonly previa = signal<PreviaCampanha | null>(null);
  protected readonly calculando = signal(false);
  protected readonly erroPrevia = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly hoje = new Date();
  protected readonly limitePrazo = new Date(Date.now() + 366 * 86_400_000);

  protected readonly form = new FormGroup({
    origem: new FormControl<OrigemCampanha>('SEM_LIGACAO', { nonNullable: true }),
    unidade: new FormControl<OpcaoUnidade | string | null>(null, [Validators.required, daLista]),
    situacao: new FormControl<'TODOS' | 'FACTIVEL' | 'CORTADO'>('TODOS', { nonNullable: true }),
    motivoCorte: new FormControl<'' | 'INADIMPLENCIA' | 'A_PEDIDO'>('', { nonNullable: true }),
    nome: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3), Validators.maxLength(120)],
    }),
    acao: new FormControl<AcaoCampanha>('LIGACAO', { nonNullable: true }),
    prazo: new FormControl<Date | null>(null, Validators.required),
  });

  private readonly valores = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly opcoesUnidade = computed(() => {
    const unidades = this.dadosUnidades.hasValue()
      ? arvoreDeUnidades(this.dadosUnidades.value())
      : [];
    const v = this.valores();
    const texto = v.unidade;
    const filtradas = typeof texto === 'string' ? filtrarUnidades(unidades, texto) : unidades;
    return v.origem === 'SETOR'
      ? filtradas.filter((o) => o.tipo === 'SETOR_COMERCIAL')
      : filtradas.filter((o) => !['ETE', 'EEE'].includes(o.tipo));
  });
  protected readonly exibirUnidade = (o: OpcaoUnidade | string | null) =>
    o && typeof o === 'object' ? o.caminho : (o ?? '');
  protected readonly frasesImpacto = computed(() => {
    const p = this.previa();
    return p ? frasesDoImpacto(p.impacto, p.imoveis) : [];
  });

  constructor() {
    merge(
      this.form.controls.origem.valueChanges,
      this.form.controls.unidade.valueChanges,
      this.form.controls.situacao.valueChanges,
      this.form.controls.motivoCorte.valueChanges,
    )
      .pipe(debounceTime(300))
      .subscribe(() => void this.calcularPrevia());
    this.form.controls.situacao.valueChanges.subscribe((s) => {
      if (s === 'FACTIVEL') {
        this.form.controls.motivoCorte.setValue('', { emitEvent: false });
      }
    });
    this.busca.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed())
      .subscribe((v) => this.filtros.aplicar({ busca: v.trim() }));
    // Recorte vindo da URL: abre o diálogo quando as unidades chegarem.
    afterNextRender(() => {
      if (this.origem()) {
        this.abrirNova();
      }
    });
  }

  protected escolherStatus(status: StatusCampanha | 'TODAS'): void {
    this.filtros.aplicar({ status: status === 'ATIVA' ? null : status });
  }

  protected limparFiltros(): void {
    this.busca.setValue('', { emitEvent: false });
    this.filtros.aplicar({ busca: null, acao: null, filtroUnidade: null });
  }

  protected abrirNova(): void {
    this.erro.set(null);
    this.previa.set(null);
    this.erroPrevia.set(null);
    const area = this.areaDaUrl();
    this.area.set(area);
    this.form.reset({
      origem: area ? 'AREA_DO_MAPA' : this.origem() === 'SETOR' ? 'SETOR' : 'SEM_LIGACAO',
      unidade: null,
      situacao:
        this.situacao() === 'FACTIVEL' || this.situacao() === 'CORTADO'
          ? (this.situacao() as 'FACTIVEL' | 'CORTADO')
          : 'TODOS',
      motivoCorte:
        this.motivoCorte() === 'INADIMPLENCIA' || this.motivoCorte() === 'A_PEDIDO'
          ? (this.motivoCorte() as 'INADIMPLENCIA')
          : '',
      nome: '',
      acao: 'LIGACAO',
      prazo: new Date(Date.now() + 30 * 86_400_000),
    });
    this.dialogo = this.dialogos.open(this.modeloNova(), {
      width: '760px',
      maxWidth: '96vw',
      autoFocus: 'first-tabbable',
    });
    this.dialogo.afterClosed().subscribe(() => {
      if (this.origem()) {
        void this.router.navigate([], { queryParams: {} });
      }
    });
    this.preencherUnidadeDaUrl();
  }

  private preencherUnidadeDaUrl(): void {
    const id = this.unidade();
    if (!id) {
      return;
    }
    const tentar = () => {
      if (!this.dadosUnidades.hasValue()) {
        setTimeout(tentar, 100);
        return;
      }
      const opcao = arvoreDeUnidades(this.dadosUnidades.value()).find((o) => o.id === id);
      if (opcao) {
        this.form.controls.unidade.setValue(opcao);
      }
    };
    tentar();
  }

  private areaDaUrl(): AreaDaUrl | null {
    const valores = [this.oeste(), this.sul(), this.leste(), this.norte()].map((v) =>
      v == null ? NaN : Number(v),
    );
    if (valores.some((v) => !Number.isFinite(v))) {
      return null;
    }
    const [oeste, sul, leste, norte] = valores as [number, number, number, number];
    return { oeste, sul, leste, norte };
  }

  private recorte(): RecorteCampanha | null {
    const v = this.form.getRawValue();
    if (!v.unidade || typeof v.unidade !== 'object') {
      return null;
    }
    const area = v.origem === 'AREA_DO_MAPA' ? this.area() : null;
    if (v.origem === 'AREA_DO_MAPA' && !area) {
      return null;
    }
    return {
      origem: v.origem,
      unidadeId: v.unidade.id,
      situacao: v.situacao === 'TODOS' ? null : v.situacao,
      motivoCorte: v.situacao !== 'FACTIVEL' && v.motivoCorte ? v.motivoCorte : null,
      area,
    };
  }

  protected async calcularPrevia(): Promise<void> {
    const recorte = this.recorte();
    this.previa.set(null);
    this.erroPrevia.set(null);
    if (!recorte) {
      return;
    }
    this.calculando.set(true);
    try {
      this.previa.set(
        await firstValueFrom(this.http.post<PreviaCampanha>('/api/v1/campanhas/previa', recorte)),
      );
    } catch (falha) {
      this.erroPrevia.set(mensagemDeErro(falha));
    } finally {
      this.calculando.set(false);
    }
  }

  protected fechar(): void {
    this.dialogo?.close();
  }

  protected async criar(): Promise<void> {
    const recorte = this.recorte();
    if (this.form.invalid || !recorte) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const pedido: PedidoCampanha = {
      nome: v.nome.trim(),
      recorte,
      acao: v.acao,
      prazo: paraIso(v.prazo)!,
    };
    this.salvando.set(true);
    this.erro.set(null);
    try {
      const criada = await firstValueFrom(this.http.post<Campanha>('/api/v1/campanhas', pedido));
      this.dialogo?.close();
      await this.router.navigate(['/campanhas', criada.id]);
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
