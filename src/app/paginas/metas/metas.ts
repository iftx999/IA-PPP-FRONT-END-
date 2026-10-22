import { HttpClient, httpResource } from '@angular/common/http';
import { Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, startWith } from 'rxjs';
import type { LinhaMeta, Metas as DadosMetas, Situacao } from '../../api/tipos';
import { deIso, paraIso } from '../../nucleo/datas';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { competenciaCurta, numero, percentual } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { BarraAdesao } from '../../ui/barra-adesao';
import { SeloSituacao } from '../../ui/selo-situacao';

type Origem = 'CONTRATO' | 'MANUAL' | 'HERDADA' | 'SEM_META';

interface OpcaoUnidade {
  valor: string;
  rotulo: string;
}

/** Linha visível da árvore: a unidade, sua profundidade e se tem filhas. */
interface LinhaArvore {
  linha: LinhaMeta;
  profundidade: number;
  temFilhas: boolean;
}

const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: 'META_ATINGIDA', rotulo: 'Meta atingida' },
  { valor: 'ATENCAO', rotulo: 'Atenção' },
  { valor: 'ABAIXO_DO_ALERTA', rotulo: 'Abaixo do alerta' },
  { valor: 'SEM_META', rotulo: 'Sem meta' },
];

const ORIGENS: { valor: Origem; rotulo: string; icone: string }[] = [
  { valor: 'CONTRATO', rotulo: 'Contrato', icone: 'description' },
  { valor: 'MANUAL', rotulo: 'Manual', icone: 'edit' },
  { valor: 'HERDADA', rotulo: 'Segue a unidade acima', icone: 'subdirectory_arrow_right' },
  { valor: 'SEM_META', rotulo: 'Sem meta', icone: 'remove' },
];

/** Metas por unidade (épico C): árvore expansível com herança, meta própria e encerramento. */
@Component({
  selector: 'aurora-metas',
  imports: [
    ReactiveFormsModule, MatTableModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatAutocompleteModule, MatDatepickerModule, MatDialogModule, MatTooltipModule, MatProgressSpinnerModule,
    SeloSituacao, BarraAdesao,
  ],
  templateUrl: './metas.html',
  styleUrl: './metas.scss',
})
export class Metas {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  protected readonly sessao = inject(SessaoService);

  protected readonly dados = httpResource<DadosMetas>(() => '/api/v1/metas');
  protected readonly metas = computed(() => (this.dados.hasValue() ? this.dados.value() : undefined));

  protected readonly situacoes = SITUACOES;
  protected readonly origens = ORIGENS;
  protected readonly busca = new FormControl('', { nonNullable: true });
  protected readonly filtroSituacao = new FormControl<Situacao | null>(null);
  protected readonly filtroOrigem = new FormControl<Origem | null>(null);
  private readonly termo = toSignal(this.busca.valueChanges.pipe(startWith('')), { initialValue: '' });
  private readonly situacao = toSignal(this.filtroSituacao.valueChanges.pipe(startWith(null)), { initialValue: null });
  private readonly origem = toSignal(this.filtroOrigem.valueChanges.pipe(startWith(null)), { initialValue: null });
  protected readonly filtrando = computed(() => !!this.termo().trim() || this.situacao() != null || this.origem() != null);

  /** Unidades recolhidas (por padrão a árvore vem toda aberta). */
  protected readonly recolhidas = signal(new Set<string>());

  protected readonly colunas = computed(() => {
    const base = ['unidade', 'meta', 'vigencia', 'origem', 'adesao', 'situacao'];
    return this.sessao.pode('indicador:gerenciar') ? [...base, 'acoes'] : base;
  });

  /** Árvore achatada para a tabela; com filtro ativo, lista plana só com as unidades que casam. */
  protected readonly linhasVisiveis = computed<LinhaArvore[]>(() => {
    const linhas = this.metas()?.linhas ?? [];
    if (this.filtrando()) {
      const termo = this.termo().trim().toLocaleLowerCase('pt-BR');
      return linhas
        .filter(
          (l) =>
            (!termo || l.unidadeNome.toLocaleLowerCase('pt-BR').includes(termo)) &&
            (this.situacao() == null || l.situacao === this.situacao()) &&
            (this.origem() == null || this.origemDa(l) === this.origem()),
        )
        .map((linha) => ({ linha, profundidade: 0, temFilhas: false }));
    }
    const filhas = new Map<string | null, LinhaMeta[]>();
    const ids = new Set(linhas.map((l) => l.unidadeId));
    for (const l of linhas) {
      const pai = l.unidadePaiId && ids.has(l.unidadePaiId) ? l.unidadePaiId : null;
      filhas.set(pai, [...(filhas.get(pai) ?? []), l]);
    }
    const visiveis: LinhaArvore[] = [];
    const visitar = (pai: string | null, profundidade: number) => {
      for (const linha of filhas.get(pai) ?? []) {
        const temFilhas = (filhas.get(linha.unidadeId)?.length ?? 0) > 0;
        visiveis.push({ linha, profundidade, temFilhas });
        if (temFilhas && !this.recolhidas().has(linha.unidadeId)) {
          visitar(linha.unidadeId, profundidade + 1);
        }
      }
    };
    visitar(null, 0);
    return visiveis;
  });

  // ----- Diálogos -----
  private readonly modeloNova = viewChild.required<TemplateRef<unknown>>('modeloNova');
  private readonly modeloEncerrar = viewChild.required<TemplateRef<unknown>>('modeloEncerrar');
  private dialogoAberto?: MatDialogRef<unknown>;

  protected readonly unidadeEscolhida = new FormControl<OpcaoUnidade | string | null>(null, [
    Validators.required,
    (c) => (c.value && typeof c.value === 'object' ? null : { escolha: true }),
  ]);
  private readonly textoUnidade = toSignal(this.unidadeEscolhida.valueChanges.pipe(startWith(null)), {
    initialValue: null,
  });
  protected readonly opcoesUnidade = computed<OpcaoUnidade[]>(() => {
    const digitado = this.textoUnidade();
    const termo = typeof digitado === 'string' ? digitado.toLocaleLowerCase('pt-BR') : '';
    return (this.metas()?.linhas ?? [])
      .map((l) => ({ valor: l.unidadeId, rotulo: l.unidadeNome }))
      .filter((o) => !termo || o.rotulo.toLocaleLowerCase('pt-BR').includes(termo));
  });
  protected readonly exibirUnidade = (o: OpcaoUnidade | string | null) => (o && typeof o === 'object' ? o.rotulo : (o ?? ''));

  protected readonly formulario = new FormGroup({
    valor: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01), Validators.max(100)]),
    alerta: new FormControl<number | null>(null, [Validators.required, Validators.min(0), Validators.max(100)]),
    vigenciaInicio: new FormControl<Date | null>(new Date(), [Validators.required]),
    vigenciaFim: new FormControl<Date | null>(null),
  });
  protected readonly fimEncerramento = new FormControl<Date | null>(new Date(), [Validators.required]);
  /** Formulário do diálogo de encerramento (sem [formGroup], o submit seria o nativo e recarregaria a página). */
  protected readonly formEncerrar = new FormGroup({ fim: this.fimEncerramento });
  protected readonly emEncerramento = signal<LinhaMeta | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly fmt = { numero, percentual, competenciaCurta };

  protected readonly rastrear = (_: number, r: LinhaArvore) => r.linha.unidadeId;

  protected origemDa(l: LinhaMeta): Origem {
    if (l.propria) {
      return l.propria.doContrato || l.propria.origem ? 'CONTRATO' : 'MANUAL';
    }
    return l.herdada ? 'HERDADA' : 'SEM_META';
  }

  protected vigencia(inicio: string, fim: string | null): string {
    const de = competenciaCurta(inicio.slice(0, 7));
    return fim ? `${de} – ${competenciaCurta(fim.slice(0, 7))}` : `desde ${de}`;
  }

  protected alternar(id: string): void {
    this.recolhidas.update((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) {
        novo.delete(id);
      } else {
        novo.add(id);
      }
      return novo;
    });
  }

  protected limparFiltros(): void {
    this.busca.setValue('');
    this.filtroSituacao.setValue(null);
    this.filtroOrigem.setValue(null);
  }

  protected abrirNova(linha?: LinhaMeta): void {
    this.erro.set(null);
    this.unidadeEscolhida.reset(linha ? { valor: linha.unidadeId, rotulo: linha.unidadeNome } : null);
    this.formulario.reset({ valor: null, alerta: null, vigenciaInicio: new Date(), vigenciaFim: null });
    this.dialogoAberto = this.dialogos.open(this.modeloNova(), { width: '560px', autoFocus: 'dialog' });
  }

  protected abrirEncerrar(linha: LinhaMeta): void {
    this.erro.set(null);
    this.emEncerramento.set(linha);
    this.fimEncerramento.reset(new Date());
    this.dialogoAberto = this.dialogos.open(this.modeloEncerrar(), { width: '460px' });
  }

  protected inicioDaMeta(): Date | null {
    return deIso(this.emEncerramento()?.propria?.vigenciaInicio);
  }

  protected async salvarNova(): Promise<void> {
    this.unidadeEscolhida.markAsTouched();
    if (this.formulario.invalid || this.unidadeEscolhida.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const v = this.formulario.getRawValue();
    if ((v.alerta ?? 0) > (v.valor ?? 0)) {
      this.erro.set('O limite de alerta não pode ser maior que a meta.');
      return;
    }
    const unidade = this.unidadeEscolhida.value as OpcaoUnidade;
    await this.enviar(() =>
      this.http.post('/api/v1/metas', {
        unidadeId: unidade.valor,
        valor: v.valor,
        alerta: v.alerta,
        vigenciaInicio: paraIso(v.vigenciaInicio),
        vigenciaFim: paraIso(v.vigenciaFim),
      }),
    );
  }

  protected async confirmarEncerramento(): Promise<void> {
    const linha = this.emEncerramento();
    if (!linha?.propria || this.fimEncerramento.invalid) {
      this.fimEncerramento.markAsTouched();
      return;
    }
    await this.enviar(() =>
      this.http.post(`/api/v1/metas/${linha.propria!.id}/encerramento`, { fim: paraIso(this.fimEncerramento.value) }),
    );
  }

  protected fechar(): void {
    this.dialogoAberto?.close();
  }

  private async enviar(requisicao: () => ReturnType<HttpClient['post']>): Promise<void> {
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await firstValueFrom(requisicao());
      this.dialogoAberto?.close();
      this.dados.reload();
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
