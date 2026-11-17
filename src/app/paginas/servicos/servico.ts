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
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, map, startWith } from 'rxjs';
import type {
  AlvoServico,
  CatalogoServicos,
  DefinicaoServico,
  ParametroServico,
  PedidoServico,
  Servico,
  TipoParametro,
  UnidadeMedida,
  VersaoServico,
} from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { dataEHora, numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { Selo } from '../../ui/selo';
import {
  ROTULO_ALVO,
  ROTULO_TIPO_PARAMETRO,
  ROTULO_UNIDADE,
  chaveDoRotulo,
  faixaDoParametro,
  origensDeCondicao,
  parametrosVisiveis,
  resumoDosPrazos,
  tempoPadrao,
  valoresDaCondicao,
} from './textos';

const MAXIMO_DE_PARAMETROS = 40;

function formularioDoParametro(p?: ParametroServico) {
  return new FormGroup({
    rotulo: new FormControl(p?.rotulo ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    }),
    chave: new FormControl(p?.chave ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[a-z][a-z0-9_]{0,39}$/)],
    }),
    ajuda: new FormControl(p?.ajuda ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
    tipo: new FormControl<TipoParametro>(p?.tipo ?? 'SIM_NAO', { nonNullable: true }),
    obrigatorio: new FormControl(p?.obrigatorio ?? true, { nonNullable: true }),
    minimo: new FormControl<number | null>(p?.minimo ?? null),
    maximo: new FormControl<number | null>(p?.maximo ?? null),
    unidade: new FormControl(p?.unidade ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(10)],
    }),
    opcoes: new FormControl<string[]>(p?.opcoes ?? [], { nonNullable: true }),
    condicaoChave: new FormControl<string | null>(p?.condicao?.chave ?? null),
    condicaoValor: new FormControl<string | null>(p?.condicao?.valor ?? null),
  });
}
type FormParametro = ReturnType<typeof formularioDoParametro>;

/** Valor do formulário do parâmetro no formato da API. */
function parametroDoFormulario(v: FormParametro['value']): ParametroServico {
  const tipo = v.tipo ?? 'SIM_NAO';
  const comFaixa = ['INTEIRO', 'DECIMAL', 'TEXTO', 'FOTO'].includes(tipo);
  const numerico = tipo === 'INTEIRO' || tipo === 'DECIMAL';
  const comOpcoes = tipo === 'LISTA' || tipo === 'LISTA_MULTIPLA';
  return {
    chave: (v.chave ?? '').trim(),
    rotulo: (v.rotulo ?? '').trim(),
    ajuda: v.ajuda?.trim() || null,
    tipo,
    obrigatorio: v.obrigatorio ?? false,
    minimo: comFaixa && v.minimo != null && `${v.minimo}` !== '' ? Number(v.minimo) : null,
    maximo: comFaixa && v.maximo != null && `${v.maximo}` !== '' ? Number(v.maximo) : null,
    unidade: numerico ? v.unidade?.trim() || null : null,
    opcoes: comOpcoes ? (v.opcoes ?? []) : [],
    condicao:
      v.condicaoChave && v.condicaoValor
        ? { chave: v.condicaoChave, valor: v.condicaoValor }
        : null,
  };
}

/**
 * Cadastro e edição de um serviço do catálogo (ADR 0042, J1–J2): definição, prazos, exigências,
 * parâmetros de encerramento com pré-visualização do formulário do app e histórico de versões.
 */
@Component({
  selector: 'aurora-servico',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatDialogModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    Selo,
  ],
  templateUrl: './servico.html',
  styleUrls: ['../campanhas/campanhas.scss', './servico.scss'],
})
export class ServicoPagina {
  /** "novo" ou o id do serviço (rota). */
  readonly id = input.required<string>();

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly avisos = inject(MatSnackBar);
  private readonly dialogos = inject(MatDialog);
  protected readonly sessao = inject(SessaoService);

  protected readonly podeGerir = computed(() => this.sessao.pode('servico:gerenciar'));
  protected readonly novo = computed(() => this.id() === 'novo');
  protected readonly catalogo = httpResource<CatalogoServicos>(() =>
    this.podeGerir() ? '/api/v1/catalogo' : undefined,
  );
  protected readonly versoes = httpResource<VersaoServico[]>(() =>
    this.podeGerir() && !this.novo() ? `/api/v1/catalogo/servicos/${this.id()}/versoes` : undefined,
  );
  protected readonly servico = computed<Servico | null | undefined>(() => {
    if (this.novo()) {
      return null;
    }
    return this.catalogo.hasValue()
      ? (this.catalogo.value().servicos.find((s) => s.id === this.id()) ?? undefined)
      : undefined;
  });
  protected readonly naoEncontrado = computed(
    () => !this.novo() && this.catalogo.hasValue() && this.servico() === undefined,
  );
  protected readonly grupos = computed(() =>
    this.catalogo.hasValue()
      ? this.catalogo.value().grupos.filter((g) => g.ativo || g.id === this.servico()?.grupoId)
      : [],
  );
  protected readonly veiculos = computed(() =>
    this.catalogo.hasValue() ? this.catalogo.value().veiculos : [],
  );
  protected readonly habilidades = computed(() =>
    this.catalogo.hasValue() ? this.catalogo.value().habilidades : [],
  );

  protected readonly fmt = { numero, dataEHora, tempoPadrao, resumoDosPrazos, faixaDoParametro };
  protected readonly alvos = Object.entries(ROTULO_ALVO).map(([valor, rotulo]) => ({
    valor: valor as AlvoServico,
    rotulo,
  }));
  protected readonly unidades = Object.entries(ROTULO_UNIDADE).map(([valor, u]) => ({
    valor: valor as UnidadeMedida,
    rotulo: `${u.longo} (${u.curto})`,
  }));
  protected readonly tiposParametro = Object.entries(ROTULO_TIPO_PARAMETRO).map(([valor, t]) => ({
    valor: valor as TipoParametro,
    ...t,
  }));
  protected readonly rotuloTipo = ROTULO_TIPO_PARAMETRO;
  protected readonly maximoDeParametros = MAXIMO_DE_PARAMETROS;

  protected readonly form = new FormGroup({
    grupoId: new FormControl<string | null>(null, Validators.required),
    codigo: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(40)] }),
    ativo: new FormControl(true, { nonNullable: true }),
    nome: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3), Validators.maxLength(120)],
    }),
    descricao: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    alvo: new FormControl<AlvoServico>('IMOVEL', { nonNullable: true }),
    unidadeMedida: new FormControl<UnidadeMedida>('UN', { nonNullable: true }),
    tempoPadraoMin: new FormControl<number | null>(30, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(1440),
    ]),
    tempoPorUnidade: new FormControl(false, { nonNullable: true }),
    emergencialHoras: new FormControl<number | null>(24, [
      Validators.required,
      Validators.min(1),
      Validators.max(72),
    ]),
    altaDias: new FormControl<number | null>(2, [
      Validators.required,
      Validators.min(1),
      Validators.max(365),
    ]),
    mediaDias: new FormControl<number | null>(5, [
      Validators.required,
      Validators.min(1),
      Validators.max(365),
    ]),
    baixaDias: new FormControl<number | null>(10, [
      Validators.required,
      Validators.min(1),
      Validators.max(365),
    ]),
    tipoVeiculoId: new FormControl<string | null>(null),
    habilidadeId: new FormControl<string | null>(null),
    conferidoPelaCarga: new FormControl(false, { nonNullable: true }),
    parametros: new FormArray<FormParametro>([]),
  });
  protected get parametros(): FormArray<FormParametro> {
    return this.form.controls.parametros;
  }

  /** Valor atual do formulário (para a pré-visualização e os campos que dependem de outros). */
  private readonly valor = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );
  protected readonly parametrosAtuais = computed(() =>
    this.valor().parametros.map((p) => parametroDoFormulario(p)),
  );
  protected readonly codigoSugerido = computed(() =>
    chaveDoRotulo(this.valor().nome).toUpperCase(),
  );
  protected readonly unidadeContavel = computed(() => this.valor().unidadeMedida !== 'UN');
  protected readonly unidadeCurta = computed(
    () => ROTULO_UNIDADE[this.valor().unidadeMedida].curto,
  );
  protected readonly emImovel = computed(() => this.valor().alvo === 'IMOVEL');
  protected readonly resumoTempo = computed(() => {
    const v = this.valor();
    return v.tempoPadraoMin
      ? tempoPadrao({
          tempoPadraoMin: Number(v.tempoPadraoMin),
          tempoPorUnidade: v.tempoPorUnidade,
          unidadeMedida: v.unidadeMedida,
        })
      : '';
  });

  // Pré-visualização: valores escolhidos pela pessoa para testar as condições.
  protected readonly valoresPreview = signal<Record<string, string | undefined>>({});
  protected readonly visiveisNoApp = computed(() =>
    parametrosVisiveis(
      this.parametrosAtuais().filter((p) => p.rotulo.length >= 2),
      this.valoresPreview(),
    ),
  );

  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  private carregado: string | null = null;

  constructor() {
    // Preenche o formulário uma vez por serviço (não sobrescreve a edição em curso a cada recarga).
    effect(() => {
      const s = this.servico();
      const chave = this.novo() ? 'novo' : s?.id;
      if (!chave || this.carregado === chave || (s === undefined && !this.novo())) {
        return;
      }
      this.carregado = chave;
      this.preencher(s ?? null);
    });
    this.form.controls.unidadeMedida.valueChanges.subscribe((u) => {
      if (u === 'UN') {
        this.form.controls.tempoPorUnidade.setValue(false);
      }
    });
    this.form.controls.alvo.valueChanges.subscribe((a) => {
      if (a !== 'IMOVEL') {
        this.form.controls.conferidoPelaCarga.setValue(false);
      }
    });
  }

  private preencher(s: Servico | null): void {
    const d = s?.definicao;
    // Primeiro o reset e só depois os parâmetros: reset() também reiniciaria os parâmetros carregados, e os
    // campos que aceitam nulo (condição, mínimo, máximo) voltariam a nulo.
    this.parametros.clear({ emitEvent: false });
    this.form.reset({
      grupoId: s?.grupoId ?? null,
      codigo: s?.codigo ?? '',
      ativo: s?.ativo ?? true,
      nome: d?.nome ?? '',
      descricao: d?.descricao ?? '',
      alvo: d?.alvo ?? 'IMOVEL',
      unidadeMedida: d?.unidadeMedida ?? 'UN',
      tempoPadraoMin: d?.tempoPadraoMin ?? 30,
      tempoPorUnidade: d?.tempoPorUnidade ?? false,
      emergencialHoras: d?.prazos.emergencialHoras ?? 24,
      altaDias: d?.prazos.altaDias ?? 2,
      mediaDias: d?.prazos.mediaDias ?? 5,
      baixaDias: d?.prazos.baixaDias ?? 10,
      tipoVeiculoId: d?.tipoVeiculoId ?? null,
      habilidadeId: d?.habilidadeId ?? null,
      conferidoPelaCarga: d?.conferidoPelaCarga ?? false,
    });
    for (const p of d?.parametros ?? []) {
      this.parametros.push(formularioDoParametro(p));
    }
    if (s) {
      this.form.controls.codigo.disable();
    }
    this.valoresPreview.set({});
  }

  // ----- Parâmetros -----
  protected readonly aberto = signal<number | null>(null);

  protected adicionarParametro(): void {
    if (this.parametros.length >= MAXIMO_DE_PARAMETROS) {
      return;
    }
    this.parametros.push(formularioDoParametro());
    this.aberto.set(this.parametros.length - 1);
  }

  protected removerParametro(indice: number): void {
    const chave = this.parametros.at(indice).controls.chave.value;
    this.parametros.removeAt(indice);
    // Condições que apontavam para o parâmetro removido deixam de existir.
    for (const p of this.parametros.controls) {
      if (p.controls.condicaoChave.value === chave) {
        p.patchValue({ condicaoChave: null, condicaoValor: null });
      }
    }
    this.aberto.set(null);
  }

  protected mover(indice: number, passo: -1 | 1): void {
    const destino = indice + passo;
    if (destino < 0 || destino >= this.parametros.length) {
      return;
    }
    const controle = this.parametros.at(indice);
    this.parametros.removeAt(indice, { emitEvent: false });
    this.parametros.insert(destino, controle);
    // Condição só pode apontar para parâmetro anterior: limpa as que ficaram inválidas.
    this.parametros.controls.forEach((p, i) => {
      const origem = p.controls.condicaoChave.value;
      if (
        origem &&
        !origensDeCondicao(this.parametrosAtuais(), i).some((o) => o.chave === origem)
      ) {
        p.patchValue({ condicaoChave: null, condicaoValor: null });
      }
    });
    this.aberto.set(destino);
  }

  protected sugerirChave(indice: number): void {
    const p = this.parametros.at(indice);
    if (!p.controls.chave.value) {
      p.controls.chave.setValue(chaveDoRotulo(p.controls.rotulo.value));
    }
  }

  protected adicionarOpcao(indice: number, evento: MatChipInputEvent): void {
    const texto = (evento.value ?? '').trim();
    const controle = this.parametros.at(indice).controls.opcoes;
    if (texto && !controle.value.some((o) => o.toLowerCase() === texto.toLowerCase())) {
      controle.setValue([...controle.value, texto.slice(0, 60)]);
    }
    evento.chipInput.clear();
  }

  protected removerOpcao(indice: number, opcao: string): void {
    const controle = this.parametros.at(indice).controls.opcoes;
    controle.setValue(controle.value.filter((o) => o !== opcao));
  }

  protected origens(indice: number): ParametroServico[] {
    return origensDeCondicao(this.parametrosAtuais(), indice);
  }

  protected valoresDe(chave: string | null): { valor: string; rotulo: string }[] {
    return valoresDaCondicao(this.parametrosAtuais().find((p) => p.chave === chave));
  }

  protected temFaixa(tipo: TipoParametro): boolean {
    return ['INTEIRO', 'DECIMAL', 'TEXTO', 'FOTO'].includes(tipo);
  }

  protected rotuloFaixa(tipo: TipoParametro): [string, string] {
    return tipo === 'FOTO'
      ? ['Mínimo de fotos', 'Máximo de fotos']
      : tipo === 'TEXTO'
        ? ['Mínimo de caracteres', 'Máximo de caracteres']
        : ['Mínimo', 'Máximo'];
  }

  protected escolherNaPreview(chave: string, valor: string | undefined): void {
    this.valoresPreview.update((v) => ({ ...v, [chave]: valor }));
  }

  protected rotuloCondicao(p: ParametroServico): string | null {
    if (!p.condicao) {
      return null;
    }
    const origem = this.parametrosAtuais().find((o) => o.chave === p.condicao!.chave);
    const valor =
      valoresDaCondicao(origem).find((v) => v.valor === p.condicao!.valor)?.rotulo ??
      p.condicao.valor;
    return origem ? `Só quando "${origem.rotulo}" = ${valor}` : null;
  }

  // ----- Versões -----
  private readonly modeloVersao = viewChild.required<TemplateRef<unknown>>('modeloVersao');
  private dialogoVersao?: MatDialogRef<unknown>;
  protected readonly versaoAberta = signal<VersaoServico | null>(null);

  protected verVersao(v: VersaoServico): void {
    this.versaoAberta.set(v);
    this.dialogoVersao = this.dialogos.open(this.modeloVersao(), {
      width: '560px',
      maxWidth: '96vw',
    });
  }

  protected fecharVersao(): void {
    this.dialogoVersao?.close();
  }

  protected nomeDe(
    lista: readonly { id: string; nome: string }[],
    id: string | null | undefined,
  ): string {
    return id ? (lista.find((i) => i.id === id)?.nome ?? '—') : 'Nenhum';
  }

  // ----- Salvar -----
  protected async salvar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const primeiroInvalido = this.parametros.controls.findIndex((p) => p.invalid);
      if (primeiroInvalido >= 0) {
        this.aberto.set(primeiroInvalido);
      }
      this.erro.set('Revise os campos destacados.');
      return;
    }
    const v = this.form.getRawValue();
    const definicao: DefinicaoServico = {
      nome: v.nome.trim(),
      descricao: v.descricao.trim() || null,
      unidadeMedida: v.unidadeMedida,
      alvo: v.alvo,
      tempoPadraoMin: Number(v.tempoPadraoMin),
      tempoPorUnidade: v.tempoPorUnidade,
      prazos: {
        emergencialHoras: Number(v.emergencialHoras),
        altaDias: Number(v.altaDias),
        mediaDias: Number(v.mediaDias),
        baixaDias: Number(v.baixaDias),
      },
      tipoVeiculoId: v.tipoVeiculoId,
      habilidadeId: v.habilidadeId,
      conferidoPelaCarga: v.conferidoPelaCarga,
      parametros: v.parametros.map((p) => parametroDoFormulario(p)),
    };
    const pedido: PedidoServico = {
      grupoId: v.grupoId!,
      codigo: this.novo() ? v.codigo.trim() || null : null,
      ativo: v.ativo,
      definicao,
    };
    const atual = this.servico();
    this.salvando.set(true);
    this.erro.set(null);
    try {
      const salvo = await firstValueFrom(
        atual
          ? this.http.put<Servico>(`/api/v1/catalogo/servicos/${atual.id}`, pedido)
          : this.http.post<Servico>('/api/v1/catalogo/servicos', pedido),
      );
      const novaVersao = !atual || salvo.versao !== atual.versao;
      this.avisos.open(
        novaVersao
          ? `Serviço salvo · versão ${salvo.versao}`
          : 'Serviço salvo (definição igual: mesma versão)',
        'Ok',
        { duration: 5000 },
      );
      this.carregado = null;
      this.catalogo.reload();
      this.versoes.reload();
      if (!atual) {
        void this.router.navigate(['/servicos', salvo.id], { replaceUrl: true });
      }
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
