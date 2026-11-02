import { SelectionModel } from '@angular/cdk/collections';
import { HttpClient, httpResource } from '@angular/common/http';
import {
  Component,
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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorIntl, MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type {
  Campanha,
  Conferencia,
  Equipe,
  OrdemServico,
  PaginaOrdens,
  PainelCampanha,
  PedidoDistribuicao,
  Prioridade,
  ResultadoDistribuicao,
  StatusOrdem,
} from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import {
  competenciaLonga,
  data,
  dataEHora,
  numero,
  percentual,
  pontosPercentuais,
} from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { Selo } from '../../ui/selo';
import { ResultadoOrdemDialogo, type DadosResultado } from './resultado-ordem';
import {
  ROTULO_ACAO,
  ROTULO_CONFERENCIA,
  ROTULO_MOTIVO,
  ROTULO_ORIGEM,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS,
  ROTULO_STATUS_CAMPANHA,
  ROTULO_TIPO,
  etapasDoFunil,
  variacaoDesdeACriacao,
} from './textos';

const TAMANHO = 50;

/** Textos do paginador em português. */
function paginadorEmPortugues(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.nextPageLabel = 'Próxima página';
  intl.previousPageLabel = 'Página anterior';
  intl.firstPageLabel = 'Primeira página';
  intl.lastPageLabel = 'Última página';
  intl.getRangeLabel = (pagina, tamanho, total) =>
    total === 0
      ? '0 de 0'
      : `${pagina * tamanho + 1}–${Math.min((pagina + 1) * tamanho, total)} de ${numero(total)}`;
  return intl;
}

/**
 * Painel da campanha (I4): funil, efeito na adesão, produtividade por equipe, motivos e a lista de OS com envio às
 * equipes e registro de resultado pelo gestor. Filtros da lista na URL (?status=&equipe=&conferencia=&atrasadas=), para
 * o link do alerta de divergência abrir já filtrado.
 */
@Component({
  selector: 'aurora-campanha',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
    Selo,
  ],
  providers: [{ provide: MatPaginatorIntl, useFactory: paginadorEmPortugues }],
  templateUrl: './campanha.html',
  styleUrl: './campanha.scss',
})
export class CampanhaPagina {
  readonly id = input.required<string>();
  readonly status = input<StatusOrdem>();
  readonly equipe = input<string>();
  readonly conferencia = input<Conferencia>();
  readonly prioridade = input<Prioridade>();
  readonly atrasadas = input<string>();

  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly avisos = inject(MatSnackBar);
  private readonly router = inject(Router);
  protected readonly sessao = inject(SessaoService);

  protected readonly podeGerir = computed(() => this.sessao.pode('campanha:gerenciar'));
  protected readonly painel = httpResource<PainelCampanha>(() =>
    this.podeGerir() ? `/api/v1/campanhas/${this.id()}` : undefined,
  );
  protected readonly pagina = signal(0);
  protected readonly ordens = httpResource<PaginaOrdens>(() =>
    this.podeGerir()
      ? {
          url: `/api/v1/campanhas/${this.id()}/ordens`,
          params: {
            ...(this.status() ? { status: this.status()! } : {}),
            ...(this.equipe() ? { equipe: this.equipe()! } : {}),
            ...(this.conferencia() ? { conferencia: this.conferencia()! } : {}),
            ...(this.prioridade() ? { prioridade: this.prioridade()! } : {}),
            ...(this.atrasadas() === 'true' ? { atrasadas: true } : {}),
            pagina: this.pagina(),
            tamanho: TAMANHO,
          },
        }
      : undefined,
  );
  protected readonly equipes = httpResource<Equipe[]>(() =>
    this.podeGerir() ? '/api/v1/equipes' : undefined,
  );
  protected readonly equipesAtivas = computed(() =>
    this.equipes.hasValue() ? this.equipes.value().filter((e) => e.ativa) : [],
  );

  protected readonly dadosPainel = computed(() =>
    this.painel.hasValue() ? this.painel.value() : undefined,
  );
  protected readonly campanha = computed(() => this.dadosPainel()?.campanha);
  protected readonly ativa = computed(() => this.campanha()?.status === 'ATIVA');
  protected readonly itens = computed(() =>
    this.ordens.hasValue() ? this.ordens.value().itens : [],
  );
  protected readonly selecao = new SelectionModel<string>(true, []);
  protected readonly selecionadas = signal(0);
  protected readonly naoEncontrada = computed(
    () => (this.painel.error() as { status?: number } | undefined)?.status === 404,
  );

  protected readonly efeito = computed(() => {
    const p = this.dadosPainel();
    return p
      ? variacaoDesdeACriacao(p.campanha.ligadosNaCriacao, p.campanha.comRedeNaCriacao, p.agora)
      : null;
  });

  protected readonly fmt = {
    numero,
    percentual,
    pontosPercentuais,
    data,
    dataEHora,
    competenciaLonga,
  };
  protected readonly rotulos = {
    acao: ROTULO_ACAO,
    origem: ROTULO_ORIGEM,
    status: ROTULO_STATUS,
    statusCampanha: ROTULO_STATUS_CAMPANHA,
    prioridade: ROTULO_PRIORIDADE,
    conferencia: ROTULO_CONFERENCIA,
    tipo: ROTULO_TIPO,
    motivo: ROTULO_MOTIVO,
  };
  protected readonly etapas = etapasDoFunil;
  protected readonly tamanho = TAMANHO;
  protected readonly colunas = computed(() => [
    ...(this.ativa() ? ['selecao'] : []),
    'numero',
    'matricula',
    'tipo',
    'prioridade',
    'equipe',
    'status',
    'conferencia',
    'acoes',
  ]);
  protected readonly statusFiltro: StatusOrdem[] = [
    'PLANEJADA',
    'EM_CAMPO',
    'REAGENDADA',
    'EXECUTADA',
    'RECUSADA',
    'INVIAVEL',
    'CANCELADA',
  ];

  // ----- Envio às equipes -----
  private readonly modeloEnvio = viewChild.required<TemplateRef<unknown>>('modeloEnvio');
  private dialogoEnvio?: MatDialogRef<unknown>;
  protected readonly enviando = signal(false);
  protected readonly erroEnvio = signal<string | null>(null);
  protected readonly formEnvio = new FormGroup({
    equipe: new FormControl<string | null>(null, Validators.required),
    prioridade: new FormControl<Prioridade | ''>('', { nonNullable: true }),
    quantidade: new FormControl<number | null>(null, [Validators.min(1), Validators.max(5000)]),
  });

  // ----- Encerrar / cancelar -----
  protected readonly confirmando = signal<'encerrar' | 'cancelar' | null>(null);
  protected readonly finalizando = signal(false);

  constructor() {
    // Nova página ou filtro: a seleção recomeça.
    effect(() => {
      this.itens();
      this.selecao.clear();
      this.selecionadas.set(0);
    });
    this.selecao.changed.subscribe(() => this.selecionadas.set(this.selecao.selected.length));
  }

  protected filtrar(params: Record<string, string | null>): void {
    this.pagina.set(0);
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }

  protected limparFiltros(): void {
    this.pagina.set(0);
    void this.router.navigate([], { queryParams: {} });
  }

  protected temFiltro(): boolean {
    return !!(
      this.status() ||
      this.equipe() ||
      this.conferencia() ||
      this.prioridade() ||
      this.atrasadas()
    );
  }

  protected mudarPagina(evento: PageEvent): void {
    this.pagina.set(evento.pageIndex);
  }

  /** Linha da tabela tipada (o mat-table entrega a linha como any). */
  protected os(o: OrdemServico): OrdemServico {
    return o;
  }

  protected selecionavel(o: OrdemServico): boolean {
    return ['PLANEJADA', 'EM_CAMPO', 'REAGENDADA'].includes(o.status);
  }

  protected todasSelecionadas(): boolean {
    const abertas = this.itens().filter((o) => this.selecionavel(o));
    return abertas.length > 0 && abertas.every((o) => this.selecao.isSelected(o.id));
  }

  protected alternarTodas(): void {
    if (this.todasSelecionadas()) {
      this.selecao.clear();
    } else {
      this.selecao.select(
        ...this.itens()
          .filter((o) => this.selecionavel(o))
          .map((o) => o.id),
      );
    }
  }

  protected abrirEnvio(): void {
    this.erroEnvio.set(null);
    this.formEnvio.reset({ equipe: null, prioridade: '', quantidade: null });
    this.dialogoEnvio = this.dialogos.open(this.modeloEnvio(), {
      width: '520px',
      maxWidth: '96vw',
    });
  }

  protected fecharEnvio(): void {
    this.dialogoEnvio?.close();
  }

  protected async enviar(): Promise<void> {
    if (this.formEnvio.invalid) {
      this.formEnvio.markAllAsTouched();
      return;
    }
    const v = this.formEnvio.getRawValue();
    const lista = this.selecao.selected;
    const pedido: PedidoDistribuicao = {
      equipeId: v.equipe!,
      ordens: lista,
      prioridade: lista.length || !v.prioridade ? null : v.prioridade,
      quantidade: lista.length ? null : v.quantidade,
    };
    this.enviando.set(true);
    this.erroEnvio.set(null);
    try {
      const r = await firstValueFrom(
        this.http.post<ResultadoDistribuicao>(`/api/v1/campanhas/${this.id()}/distribuir`, pedido),
      );
      this.dialogoEnvio?.close();
      const fora = r.foraDaArea
        ? ` ${numero(r.foraDaArea)} ficaram de fora: o imóvel não está na área da equipe.`
        : '';
      this.avisos.open(`${numero(r.enviadas)} OS enviadas.${fora}`, 'Ok', { duration: 6000 });
      this.recarregar();
    } catch (falha) {
      this.erroEnvio.set(mensagemDeErro(falha));
    } finally {
      this.enviando.set(false);
    }
  }

  protected registrar(ordem: OrdemServico): void {
    const dados: DadosResultado = { ordem, base: '/api/v1/campanhas/ordens' };
    this.dialogos
      .open(ResultadoOrdemDialogo, { data: dados, width: '560px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((atualizada?: OrdemServico) => {
        if (atualizada) {
          this.avisos.open(
            `OS ${atualizada.numero}: ${ROTULO_STATUS[atualizada.status].texto.toLowerCase()}.`,
            'Ok',
            {
              duration: 4000,
            },
          );
          this.recarregar();
        }
      });
  }

  protected async finalizar(acao: 'encerrar' | 'cancelar'): Promise<void> {
    this.finalizando.set(true);
    try {
      await firstValueFrom(this.http.post<Campanha>(`/api/v1/campanhas/${this.id()}/${acao}`, {}));
      this.confirmando.set(null);
      this.avisos.open(acao === 'encerrar' ? 'Campanha encerrada.' : 'Campanha cancelada.', 'Ok', {
        duration: 4000,
      });
      this.recarregar();
    } catch (falha) {
      this.avisos.open(mensagemDeErro(falha), 'Ok', { duration: 6000 });
    } finally {
      this.finalizando.set(false);
    }
  }

  protected abertas(c: Campanha): number {
    return c.funil.planejadas - c.funil.executadas - c.funil.recusadas - c.funil.inviaveis;
  }

  private recarregar(): void {
    this.painel.reload();
    this.ordens.reload();
    this.equipes.reload();
  }
}
