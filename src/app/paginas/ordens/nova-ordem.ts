import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime, firstValueFrom } from 'rxjs';
import type {
  DetalheLogradouro,
  LadoDaFaixa,
  LogradouroResumo,
  PaginaLogradouros,
  PedidoFaixa,
  PreviaLote,
  Prioridade,
  ResultadoCriacaoOrdens,
  ServicoParaOrdem,
} from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { numero } from '../../nucleo/formato';
import { extensao, faixaDoTrecho, nomeCompleto } from '../logradouros/textos';
import { ROTULO_PRIORIDADE } from '../campanhas/textos';
import { matriculasDoTexto, prazoDoServico, servicosPara, type ModoNovaOrdem } from './textos';

export interface DadosNovaOrdem {
  servicos: readonly ServicoParaOrdem[];
  /** Trecho e lote dependem do cadastro de logradouros (logradouro:gerenciar). */
  comLogradouros: boolean;
  modo?: ModoNovaOrdem;
  logradouroId?: string;
}

const PRIORIDADES: Prioridade[] = ['EMERGENCIAL', 'ALTA', 'MEDIA', 'BAIXA'];

/**
 * Nova OS (J4, J5; ADR 0044): avulsa para imóveis (matrículas), de rede para trechos de um
 * logradouro, ou lote com uma OS por imóvel do logradouro (inteiro ou faixa), com prévia antes
 * de gerar. O resultado mostra quantas foram criadas e quais ficaram de fora.
 */
@Component({
  selector: 'aurora-nova-ordem',
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './nova-ordem.html',
  styleUrl: './nova-ordem.scss',
})
export class NovaOrdemDialogo {
  protected readonly dados = inject<DadosNovaOrdem>(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);

  protected readonly fmt = { numero, extensao, nomeCompleto, faixa: faixaDoTrecho };
  protected readonly prioridades = PRIORIDADES;
  protected readonly rotuloPrioridade = ROTULO_PRIORIDADE;
  protected readonly modo = signal<ModoNovaOrdem>(
    this.dados.comLogradouros ? (this.dados.modo ?? 'IMOVEIS') : 'IMOVEIS',
  );
  protected readonly servicosDoModo = computed(() =>
    servicosPara(this.dados.servicos, this.modo()),
  );

  protected readonly form = new FormGroup({
    servico: new FormControl<string | null>(null, Validators.required),
    prioridade: new FormControl<Prioridade>('MEDIA', { nonNullable: true }),
    instrucoes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    matriculas: new FormControl('', { nonNullable: true }),
    numeroInicial: new FormControl<number | null>(null, Validators.min(0)),
    numeroFinal: new FormControl<number | null>(null, Validators.min(0)),
    lado: new FormControl<LadoDaFaixa>('AMBOS', { nonNullable: true }),
  });
  protected readonly valores = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly matriculas = computed(() =>
    matriculasDoTexto(this.valores().matriculas ?? ''),
  );
  protected readonly servico = computed(() =>
    this.dados.servicos.find((s) => s.id === this.valores().servico),
  );
  protected readonly prazo = computed(() => {
    const s = this.servico();
    return s ? prazoDoServico(s, this.valores().prioridade ?? 'MEDIA') : null;
  });

  // ----- Logradouro (trecho e lote) -----
  protected readonly buscaLogradouro = new FormControl('', { nonNullable: true });
  private readonly termo = signal('');
  protected readonly sugestoes = httpResource<PaginaLogradouros>(() =>
    this.dados.comLogradouros && this.termo().length >= 2
      ? { url: '/api/v1/logradouros', params: { busca: this.termo(), pagina: 0 } }
      : undefined,
  );
  protected readonly logradouroId = signal<string | null>(this.dados.logradouroId ?? null);
  protected readonly detalhe = httpResource<DetalheLogradouro>(() =>
    this.logradouroId() ? `/api/v1/logradouros/${this.logradouroId()}` : undefined,
  );
  protected readonly trechos = signal<ReadonlySet<string>>(new Set());

  // ----- Envio -----
  protected readonly previa = signal<PreviaLote | null>(null);
  protected readonly resultado = signal<ResultadoCriacaoOrdens | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  constructor() {
    this.buscaLogradouro.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed())
      .subscribe((v) => this.termo.set(v.trim()));
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.previa.set(null);
      this.erro.set(null);
    });
  }

  protected trocarModo(modo: ModoNovaOrdem): void {
    this.modo.set(modo);
    this.form.controls.servico.setValue(null);
    this.previa.set(null);
    this.resultado.set(null);
    this.erro.set(null);
  }

  protected escolherLogradouro(l: LogradouroResumo): void {
    this.logradouroId.set(l.id);
    this.buscaLogradouro.setValue(nomeCompleto(l), { emitEvent: false });
    this.trechos.set(new Set());
    this.previa.set(null);
  }

  protected nomeDoLogradouro = (l: LogradouroResumo | string | null): string =>
    typeof l === 'string' ? l : l ? nomeCompleto(l) : '';

  protected alternarTrecho(id: string): void {
    const novo = new Set(this.trechos());
    if (novo.has(id)) {
      novo.delete(id);
    } else {
      novo.add(id);
    }
    this.trechos.set(novo);
  }

  protected todosOsTrechos(): void {
    const todos = this.detalhe.value()?.trechos.map((t) => t.id) ?? [];
    this.trechos.set(this.trechos().size === todos.length ? new Set() : new Set(todos));
  }

  private faixa(): PedidoFaixa | null {
    const v = this.form.getRawValue();
    if (!this.logradouroId() || !v.servico) {
      return null;
    }
    return {
      logradouroId: this.logradouroId()!,
      numeroInicial: v.numeroInicial,
      numeroFinal: v.numeroFinal,
      lado: v.lado,
      servicoId: v.servico,
    };
  }

  protected async verPrevia(): Promise<void> {
    const faixa = this.faixa();
    if (!faixa) {
      this.form.markAllAsTouched();
      this.erro.set(this.logradouroId() ? null : 'Escolha o logradouro.');
      return;
    }
    await this.executar(async () =>
      this.previa.set(
        await firstValueFrom(this.http.post<PreviaLote>('/api/v1/ordens/lotes/previa', faixa)),
      ),
    );
  }

  protected async criar(): Promise<void> {
    const v = this.form.getRawValue();
    if (this.form.invalid || !v.servico) {
      this.form.markAllAsTouched();
      return;
    }
    const comum = { prioridade: v.prioridade, instrucoes: v.instrucoes.trim() || null };
    const modo = this.modo();
    if (modo === 'IMOVEIS' && !this.matriculas().length) {
      this.erro.set('Informe ao menos uma matrícula.');
      return;
    }
    if (modo === 'TRECHOS' && !this.trechos().size) {
      this.erro.set('Escolha ao menos um trecho.');
      return;
    }
    if (modo === 'LOTE' && !this.previa()) {
      await this.verPrevia();
      return;
    }
    await this.executar(async () => {
      const r =
        modo === 'IMOVEIS'
          ? this.http.post<ResultadoCriacaoOrdens>('/api/v1/ordens/imoveis', {
              servicoId: v.servico,
              matriculas: this.matriculas(),
              ...comum,
            })
          : modo === 'TRECHOS'
            ? this.http.post<ResultadoCriacaoOrdens>('/api/v1/ordens/trechos', {
                servicoId: v.servico,
                trechos: [...this.trechos()],
                ...comum,
              })
            : this.http.post<ResultadoCriacaoOrdens>('/api/v1/ordens/lotes', {
                faixa: this.faixa(),
                ...comum,
              });
      this.resultado.set(await firstValueFrom(r));
    });
  }

  private async executar(acao: () => Promise<void>): Promise<void> {
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await acao();
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
