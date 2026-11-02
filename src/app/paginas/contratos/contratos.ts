import { HttpClient, httpResource } from '@angular/common/http';
import { Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, type ValidatorFn } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom } from 'rxjs';
import type { Contrato, PedidoContrato, Unidade } from '../../api/tipos';
import { paraIso } from '../../nucleo/datas';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { filtrosNaUrl } from '../../nucleo/filtros';
import { data, numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { ancestrais, arvoreDeUnidades, filtrarUnidades, semAcento, subarvore, type OpcaoUnidade } from '../../nucleo/unidades-arvore';
import { FiltroUnidade } from '../../ui/filtro-unidade';

const daLista: ValidatorFn = (c) => (c.value && typeof c.value === 'object' ? null : { escolha: true });

export type Vigencia = 'VIGENTE' | 'VENCE_EM_90_DIAS' | 'VENCIDO' | 'SEM_DATA';

export const ROTULOS_VIGENCIA: Record<Vigencia, string> = {
  VIGENTE: 'Vigentes',
  VENCE_EM_90_DIAS: 'Vencem em até 90 dias',
  VENCIDO: 'Vencidos',
  SEM_DATA: 'Sem fim de vigência',
};

export interface FiltroContratos {
  termo: string;
  /** Ids das unidades aceitas (a escolhida, as de baixo e as que a cobrem); null = todas. */
  unidades: ReadonlySet<string> | null;
  vigencia: Vigencia | null;
  soPendentes: boolean;
}

/** Filtro da lista de contratos; {@code hoje} em "yyyy-MM-dd". */
export function filtrarContratos(contratos: readonly Contrato[], f: FiltroContratos, hoje: string): Contrato[] {
  const t = semAcento(f.termo.trim());
  const limite90 = paraIso(new Date(new Date(`${hoje}T12:00:00`).getTime() + 90 * 86_400_000))!;
  return contratos.filter((c) => {
    if (t && !semAcento(`${c.numero} ${c.unidadeNome} ${c.objeto ?? ''} ${c.poderConcedente ?? ''}`).includes(t)) {
      return false;
    }
    if (f.unidades && !f.unidades.has(c.unidadeId)) {
      return false;
    }
    if (f.soPendentes && c.itensPendentes === 0) {
      return false;
    }
    const fim = c.vigenciaFim;
    switch (f.vigencia) {
      case 'VIGENTE':
        return !fim || fim >= hoje;
      case 'VENCE_EM_90_DIAS':
        return !!fim && fim >= hoje && fim <= limite90;
      case 'VENCIDO':
        return !!fim && fim < hoje;
      case 'SEM_DATA':
        return !fim;
      default:
        return true;
    }
  });
}

/** Contratos de concessão/PPP (épico A): lista e cadastro. */
@Component({
  selector: 'aurora-contratos',
  imports: [
    ReactiveFormsModule, RouterLink, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatAutocompleteModule, MatDatepickerModule, MatProgressSpinnerModule, MatSelectModule, FiltroUnidade,
  ],
  templateUrl: './contratos.html',
  styleUrl: './contratos.scss',
})
export class Contratos {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly router = inject(Router);
  protected readonly sessao = inject(SessaoService);

  private readonly podeVer = computed(() => this.sessao.pode('contrato:ler'));
  protected readonly podeGerir = computed(() => this.sessao.pode('contrato:gerenciar'));
  protected readonly dados = httpResource<Contrato[]>(() => (this.podeVer() ? '/api/v1/contratos' : undefined));
  protected readonly dadosUnidades = httpResource<Unidade[]>(() =>
    this.podeGerir() || this.sessao.pode('unidade:ler') ? '/api/v1/unidades' : undefined,
  );

  // ----- Filtros (na URL) -----
  protected readonly filtros = filtrosNaUrl(['busca', 'unidade', 'vigencia', 'revisao']);
  protected readonly busca = new FormControl(this.filtros.inicial('busca'), { nonNullable: true });
  protected readonly unidade = computed(() => this.filtros.valor('unidade'));
  protected readonly vigencia = computed(() => this.filtros.valor('vigencia') as Vigencia | null);
  protected readonly soPendentes = computed(() => this.filtros.valor('revisao') === 'PENDENTE');
  protected readonly opcoesVigencia = Object.entries(ROTULOS_VIGENCIA).map(([valor, rotulo]) => ({
    valor: valor as Vigencia,
    rotulo,
  }));
  protected readonly filtrando = computed(() => this.filtros.ativos() > 0);
  protected readonly contratos = computed(() => {
    if (!this.dados.hasValue()) {
      return undefined;
    }
    // Unidade escolhida: contratos dela, das de baixo e das de cima (um contrato da concessão cobre a cidade).
    const id = this.unidade();
    const todas = this.dadosUnidades.hasValue() ? this.dadosUnidades.value() : [];
    const unidades = id && todas.length ? new Set([...subarvore(todas, id), ...ancestrais(todas, id)].map((u) => u.id)) : null;
    return filtrarContratos(
      this.dados.value(),
      {
        termo: this.filtros.valor('busca') ?? '',
        unidades: id ? (unidades ?? new Set([id])) : null,
        vigencia: this.vigencia(),
        soPendentes: this.soPendentes(),
      },
      paraIso(new Date())!,
    );
  });
  protected readonly pendentes = computed(() => (this.dados.hasValue() ? this.dados.value().reduce((s, c) => s + c.itensPendentes, 0) : 0));

  protected readonly fmt = { data, numero };

  constructor() {
    this.busca.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed())
      .subscribe((v) => this.filtros.aplicar({ busca: v.trim() }));
  }

  protected limparFiltros(): void {
    this.busca.setValue('', { emitEvent: false });
    this.filtros.limpar();
  }

  // ----- Novo contrato -----
  private readonly modeloNovo = viewChild.required<TemplateRef<unknown>>('modeloNovo');
  private dialogoAberto?: MatDialogRef<unknown>;
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly formulario = new FormGroup({
    numero: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
    unidade: new FormControl<OpcaoUnidade | string | null>(null, [Validators.required, daLista]),
    objeto: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    poderConcedente: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
    regulador: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
    dataAssinatura: new FormControl<Date | null>(null),
    vigenciaFim: new FormControl<Date | null>(null),
  });
  private readonly textoUnidade = toSignal(this.formulario.controls.unidade.valueChanges, { initialValue: null });
  protected readonly opcoesUnidade = computed(() => {
    const unidades = this.dadosUnidades.hasValue() ? arvoreDeUnidades(this.dadosUnidades.value()) : [];
    const texto = this.textoUnidade();
    return (typeof texto === 'string' ? filtrarUnidades(unidades, texto) : unidades).filter((o) =>
      ['GRUPO', 'CONCESSAO', 'MUNICIPIO'].includes(o.tipo),
    );
  });
  protected readonly exibirUnidade = (o: OpcaoUnidade | string | null) => (o && typeof o === 'object' ? o.caminho : (o ?? ''));

  protected abrirNovo(): void {
    this.erro.set(null);
    this.formulario.reset();
    this.dialogoAberto = this.dialogos.open(this.modeloNovo(), { width: '640px', autoFocus: 'first-tabbable' });
  }

  protected fechar(): void {
    this.dialogoAberto?.close();
  }

  protected async criar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const v = this.formulario.getRawValue();
    const pedido: PedidoContrato = {
      numero: v.numero.trim(),
      unidadeId: (v.unidade as OpcaoUnidade).id,
      objeto: v.objeto.trim() || null,
      poderConcedente: v.poderConcedente.trim() || null,
      regulador: v.regulador.trim() || null,
      dataAssinatura: paraIso(v.dataAssinatura),
      vigenciaFim: paraIso(v.vigenciaFim),
    };
    this.salvando.set(true);
    this.erro.set(null);
    try {
      const criado = await firstValueFrom(this.http.post<{ id: string }>('/api/v1/contratos', pedido));
      this.dialogoAberto?.close();
      await this.router.navigate(['/contratos', criado.id]);
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
