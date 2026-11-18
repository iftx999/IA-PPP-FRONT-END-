import { SelectionModel } from '@angular/cdk/collections';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, TemplateRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, firstValueFrom } from 'rxjs';
import type {
  EquipeParaProgramar,
  OpcoesDasOrdens,
  OrdemServico,
  OrigemOrdem,
  PaginaConflitos,
  PaginaOrdensGeral,
  PedidoProgramacao,
  Prioridade,
  ResultadoCriacaoOrdens,
  ResultadoProgramacao,
  StatusOrdem,
} from '../../api/tipos';
import { deIso, paraIso } from '../../nucleo/datas';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { filtrosNaUrl } from '../../nucleo/filtros';
import { data, dataEHora, numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { Selo } from '../../ui/selo';
import {
  JustificativaOrdemDialogo,
  type DadosJustificativa,
} from '../campanhas/justificativa-ordem';
import { ResultadoOrdemDialogo, type DadosResultado } from '../campanhas/resultado-ordem';
import {
  ROTULO_ORIGEM_OS,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS,
  STATUS_DA_OS,
  alvoDaOrdem,
  podeCancelar,
  podeEncerrar,
  podeProgramar,
  quantidadeComUnidade,
} from '../campanhas/textos';
import { ConflitosDialogo } from './conflitos';
import { ExecucaoOrdemDialogo, type DadosExecucao } from './execucao-ordem';
import { NovaOrdemDialogo, type DadosNovaOrdem } from './nova-ordem';
import type { ModoNovaOrdem } from './textos';

const TAMANHO = 50;

/**
 * Programação das OS (J4, J5; ADR 0044): todas as OS do escopo com filtros na URL, criação
 * (imóveis, trechos, lote por logradouro), programação das selecionadas para uma equipe numa
 * data (RN-23: só as da área da equipe), cancelamento e encerramento pelo gestor; registros do
 * app, caixa de devolvidas e de conflitos de campo (J11; ADR 0045).
 */
@Component({
  selector: 'aurora-ordens',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    Selo,
  ],
  templateUrl: './ordens.html',
  styleUrls: ['../campanhas/campanhas.scss', '../logradouros/logradouros.scss', './ordens.scss'],
})
export class Ordens {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly avisos = inject(MatSnackBar);
  protected readonly sessao = inject(SessaoService);

  protected readonly podeProgramar = computed(() => this.sessao.pode('os:programar'));
  protected readonly fmt = { numero, data, dataEHora, quantidade: quantidadeComUnidade };
  protected readonly rotulos = {
    status: ROTULO_STATUS,
    prioridade: ROTULO_PRIORIDADE,
    origem: ROTULO_ORIGEM_OS,
  };
  protected readonly alvo = alvoDaOrdem;
  protected readonly regras = { podeProgramar, podeCancelar, podeEncerrar };
  protected readonly statusFiltro = STATUS_DA_OS;
  protected readonly prioridades: Prioridade[] = ['EMERGENCIAL', 'ALTA', 'MEDIA', 'BAIXA'];
  protected readonly origens: OrigemOrdem[] = ['AVULSA', 'LOTE', 'CAMPANHA'];

  // ----- Filtros (na URL) -----
  protected readonly filtros = filtrosNaUrl([
    'status',
    'servico',
    'equipe',
    'prioridade',
    'origem',
    'data',
    'atrasadas',
    'busca',
    'lote',
    'pagina',
    'nova',
    'logradouro',
  ]);
  protected readonly busca = new FormControl(this.filtros.inicial('busca'), { nonNullable: true });
  protected readonly pagina = computed(() => Number(this.filtros.valor('pagina') ?? 0) || 0);
  protected readonly dataFiltro = computed(() => deIso(this.filtros.valor('data')));

  protected readonly opcoes = httpResource<OpcoesDasOrdens>(() =>
    this.podeProgramar() ? '/api/v1/ordens/opcoes' : undefined,
  );
  protected readonly equipes = httpResource<EquipeParaProgramar[]>(() =>
    this.podeProgramar() ? '/api/v1/ordens/equipes' : undefined,
  );
  protected readonly lista = httpResource<PaginaOrdensGeral>(() => {
    if (!this.podeProgramar()) {
      return undefined;
    }
    const params: Record<string, string | number> = { pagina: this.pagina(), tamanho: TAMANHO };
    for (const chave of [
      'status',
      'servico',
      'equipe',
      'prioridade',
      'origem',
      'data',
      'lote',
    ] as const) {
      const valor = this.filtros.valor(chave);
      if (valor) {
        params[chave] = valor;
      }
    }
    if (this.filtros.valor('atrasadas') === 'true') {
      params['atrasadas'] = 'true';
    }
    if (this.filtros.valor('busca')) {
      params['busca'] = this.filtros.valor('busca')!;
    }
    return { url: '/api/v1/ordens', params };
  });
  /** J11: conflitos de campo à espera de decisão. */
  protected readonly conflitos = httpResource<PaginaConflitos>(() =>
    this.podeProgramar()
      ? { url: '/api/v1/ordens/conflitos', params: { abertos: true } }
      : undefined,
  );
  protected readonly conflitosAbertos = computed(() =>
    this.conflitos.hasValue() ? this.conflitos.value().abertos : 0,
  );
  protected readonly itens = computed(() =>
    this.lista.hasValue() ? this.lista.value().itens : [],
  );
  protected readonly paginas = computed(() =>
    this.lista.hasValue() ? Math.max(1, Math.ceil(this.lista.value().total / TAMANHO)) : 1,
  );

  // ----- Seleção e programação -----
  protected readonly selecao = new SelectionModel<string>(true, []);
  protected readonly selecionadas = signal(0);
  private readonly modeloProgramacao =
    viewChild.required<TemplateRef<unknown>>('modeloProgramacao');
  private dialogoProgramacao?: MatDialogRef<unknown>;
  protected readonly programando = signal(false);
  protected readonly erroProgramacao = signal<string | null>(null);
  protected readonly hoje = new Date();
  protected readonly limite = new Date(Date.now() + 180 * 86_400_000);
  protected readonly formProgramacao = new FormGroup({
    equipe: new FormControl<string | null>(null, Validators.required),
    data: new FormControl<Date | null>(null, Validators.required),
  });

  constructor() {
    this.busca.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((v) => this.filtros.aplicar({ busca: v.trim(), pagina: null }));
    this.selecao.changed
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.selecionadas.set(this.selecao.selected.length));
    // Atalho vindo do logradouro: /ordens?nova=lote&logradouro=<id>.
    effect(() => {
      const nova = this.filtros.valor('nova');
      if (nova && this.opcoes.hasValue()) {
        const modo = nova === 'trechos' ? 'TRECHOS' : nova === 'lote' ? 'LOTE' : 'IMOVEIS';
        const logradouro = this.filtros.valor('logradouro') ?? undefined;
        this.filtros.aplicar({ nova: null, logradouro: null });
        queueMicrotask(() => this.novaOrdem(modo, logradouro));
      }
    });
  }

  protected filtrar(valores: Partial<Record<string, string | null>>): void {
    this.selecao.clear();
    this.filtros.aplicar({ ...valores, pagina: null });
  }

  protected filtrarData(valor: Date | null): void {
    this.filtrar({ data: paraIso(valor) });
  }

  protected limparFiltros(): void {
    this.busca.setValue('', { emitEvent: false });
    this.selecao.clear();
    this.filtros.limpar();
  }

  protected irParaPagina(pagina: number): void {
    this.selecao.clear();
    this.filtros.aplicar({ pagina: pagina > 0 ? String(pagina) : null });
  }

  protected selecionaveis(): OrdemServico[] {
    return this.itens().filter((o) => podeProgramar(o.status));
  }

  protected todasSelecionadas(): boolean {
    const lista = this.selecionaveis();
    return lista.length > 0 && lista.every((o) => this.selecao.isSelected(o.id));
  }

  protected alternarTodas(): void {
    if (this.todasSelecionadas()) {
      this.selecao.clear();
    } else {
      this.selecao.select(...this.selecionaveis().map((o) => o.id));
    }
  }

  protected abrirProgramacao(): void {
    this.erroProgramacao.set(null);
    this.formProgramacao.reset({ equipe: null, data: new Date() });
    this.dialogoProgramacao = this.dialogos.open(this.modeloProgramacao(), {
      width: '520px',
      maxWidth: '96vw',
    });
  }

  protected fecharProgramacao(): void {
    this.dialogoProgramacao?.close();
  }

  protected async programar(): Promise<void> {
    if (this.formProgramacao.invalid) {
      this.formProgramacao.markAllAsTouched();
      return;
    }
    const v = this.formProgramacao.getRawValue();
    const pedido: PedidoProgramacao = {
      ordens: this.selecao.selected,
      equipeId: v.equipe!,
      data: paraIso(v.data)!,
    };
    this.programando.set(true);
    this.erroProgramacao.set(null);
    try {
      const r = await firstValueFrom(
        this.http.post<ResultadoProgramacao>('/api/v1/ordens/programar', pedido),
      );
      this.dialogoProgramacao?.close();
      const partes = [`${numero(r.programadas)} OS programadas.`];
      if (r.foraDaArea) {
        partes.push(`${numero(r.foraDaArea)} fora da área da equipe.`);
      }
      if (r.ignoradas) {
        partes.push(`${numero(r.ignoradas)} já em execução ou encerradas.`);
      }
      this.avisos.open(partes.join(' '), 'Ok', { duration: 6000 });
      this.selecao.clear();
      this.lista.reload();
      this.equipes.reload();
    } catch (falha) {
      this.erroProgramacao.set(mensagemDeErro(falha));
    } finally {
      this.programando.set(false);
    }
  }

  // ----- Criar, cancelar, encerrar -----
  protected novaOrdem(modo?: ModoNovaOrdem, logradouroId?: string): void {
    const dados: DadosNovaOrdem = {
      servicos: this.opcoes.value()?.servicos ?? [],
      comLogradouros: this.sessao.pode('logradouro:gerenciar'),
      modo,
      logradouroId,
    };
    this.dialogos
      .open(NovaOrdemDialogo, { data: dados, width: '680px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r?: ResultadoCriacaoOrdens) => {
        if (r?.criadas) {
          this.filtrar(r.loteId ? { lote: r.loteId, status: null } : { status: 'PLANEJADA' });
          this.lista.reload();
        }
      });
  }

  protected cancelar(ordem: OrdemServico): void {
    const dados: DadosJustificativa = {
      ordem,
      acao: 'CANCELAMENTO',
      url: `/api/v1/ordens/${ordem.id}/cancelar`,
      motivos: this.opcoes.value()?.motivos ?? [],
    };
    this.depois(
      this.dialogos.open(JustificativaOrdemDialogo, {
        data: dados,
        width: '520px',
        maxWidth: '96vw',
      }),
    );
  }

  protected encerrar(ordem: OrdemServico): void {
    const dados: DadosResultado = {
      ordem,
      base: '/api/v1/ordens',
      motivos: this.opcoes.value()?.motivos ?? [],
    };
    this.depois(
      this.dialogos.open(ResultadoOrdemDialogo, { data: dados, width: '560px', maxWidth: '96vw' }),
    );
  }

  private depois(dialogo: MatDialogRef<unknown, OrdemServico>): void {
    dialogo.afterClosed().subscribe((atualizada) => {
      if (atualizada) {
        this.avisos.open(
          `OS ${atualizada.numero}: ${ROTULO_STATUS[atualizada.status].texto.toLowerCase()}.`,
          'Ok',
          { duration: 4000 },
        );
        this.selecao.deselect(atualizada.id);
        this.lista.reload();
      }
    });
  }

  // ----- Execução no campo (ADR 0045) -----
  protected registros(ordem: OrdemServico): void {
    this.dialogos.open<ExecucaoOrdemDialogo, DadosExecucao>(ExecucaoOrdemDialogo, {
      data: { ordem },
      width: '44rem',
      maxWidth: 'calc(100vw - 2rem)',
      autoFocus: 'dialog',
    });
  }

  protected abrirConflitos(): void {
    this.dialogos
      .open(ConflitosDialogo, { width: '44rem', maxWidth: 'calc(100vw - 2rem)' })
      .afterClosed()
      .subscribe((alterou?: boolean) => {
        if (alterou) {
          this.conflitos.reload();
          this.lista.reload();
        }
      });
  }

  /** Atalho da caixa de devolvidas (J11). */
  protected verDevolvidas(): void {
    this.filtrar({ status: this.filtros.valor('status') === 'DEVOLVIDA' ? null : 'DEVOLVIDA' });
  }

  protected rotuloStatus(s: StatusOrdem): string {
    return ROTULO_STATUS[s].texto;
  }
}
