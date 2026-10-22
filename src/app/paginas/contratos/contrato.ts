import { HttpClient, httpResource } from '@angular/common/http';
import { Component, DestroyRef, TemplateRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom, type Observable } from 'rxjs';
import type {
  DetalheContrato, DocumentoContrato, ItemContratual, PedidoItem, StatusItem, TipoItem, Unidade,
} from '../../api/tipos';
import { deIso, paraIso } from '../../nucleo/datas';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { data, dataEHora, haQuantoTempo, numero, percentual } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { arvoreDeUnidades, filtrarUnidades, subarvore, type OpcaoUnidade } from '../../nucleo/unidades-arvore';
import { Selo } from '../../ui/selo';
import { VisualizadorPdf } from '../../ui/visualizador-pdf';
import { SITUACOES_DOCUMENTO, STATUS_ITEM, TIPOS_ITEM, referencia } from './rotulos';

type Filtro = 'TODOS' | StatusItem;

/** Campos da proposta original da IA que a revisão mostra lado a lado. */
export interface Diferenca {
  campo: string;
  ia: string;
}

/** O que mudou entre a proposta da IA e o item atual (só os campos que a pessoa costuma corrigir). */
export function diferencasDaIa(item: ItemContratual): Diferenca[] {
  const p = item.propostaIa as Record<string, unknown> | null;
  if (!p) {
    return [];
  }
  const texto = (v: unknown) => (v == null || v === '' ? '—' : String(v));
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
  const pares: [string, unknown, unknown, boolean?][] = [
    ['Título', p['titulo'], item.titulo],
    ['Cláusula', p['clausula'] || null, item.clausula],
    ['Página', p['pagina'], item.pagina],
    ['Valor', num(p['valorReferencia']), item.valorReferencia, true],
    ['Limite de alerta', num(p['valorAlerta']), item.valorAlerta, true],
    ['Data limite', p['dataLimite'], item.dataLimite],
    ['Início da vigência', p['vigenciaInicio'], item.vigenciaInicio],
    ['Unidade', p['unidadeAlvo'], item.unidadeNome],
  ];
  return pares
    .filter(([, ia, atual, numerico]) => (numerico ? num(ia) !== num(atual) : texto(ia) !== texto(atual)))
    .map(([campo, ia]) => ({ campo, ia: texto(ia) }));
}

/** Detalhe do contrato (A1–A4): documentos, processamento e revisão dos itens ao lado do PDF. */
@Component({
  selector: 'aurora-contrato',
  imports: [
    ReactiveFormsModule, RouterLink, MatButtonModule, MatButtonToggleModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatAutocompleteModule, MatDatepickerModule, MatMenuModule, MatTooltipModule,
    MatProgressSpinnerModule, MatSnackBarModule, Selo, VisualizadorPdf,
  ],
  templateUrl: './contrato.html',
  styleUrl: './contrato.scss',
})
export class ContratoPagina {
  /** Da rota (/contratos/:id). */
  readonly id = input.required<string>();

  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly avisos = inject(MatSnackBar);
  protected readonly sessao = inject(SessaoService);

  protected readonly podeGerir = computed(() => this.sessao.pode('contrato:gerenciar'));
  protected readonly dados = httpResource<DetalheContrato>(() => `/api/v1/contratos/${this.id()}`);
  protected readonly dadosItens = httpResource<ItemContratual[]>(() => `/api/v1/contratos/${this.id()}/itens`);
  private readonly dadosUnidades = httpResource<Unidade[]>(() => '/api/v1/unidades');

  protected readonly detalhe = computed(() => (this.dados.hasValue() ? this.dados.value() : undefined));
  protected readonly itens = computed(() => (this.dadosItens.hasValue() ? this.dadosItens.value() : undefined));
  protected readonly naoEncontrado = computed(() => (this.dados.error() as { status?: number } | undefined)?.status === 404);
  protected readonly processando = computed(() =>
    (this.detalhe()?.documentos ?? []).some((d) => SITUACOES_DOCUMENTO[d.situacao].andamento),
  );

  protected readonly filtro = signal<Filtro | null>(null);
  /** Abre em "Para revisar" quando há pendências; senão, em "Todos". */
  protected readonly filtroEfetivo = computed<Filtro>(
    () => this.filtro() ?? ((this.itens() ?? []).some((i) => i.status === 'PROPOSTO') ? 'PROPOSTO' : 'TODOS'),
  );
  protected readonly itensVisiveis = computed(() => {
    const f = this.filtroEfetivo();
    return (this.itens() ?? []).filter((i) => f === 'TODOS' || i.status === f);
  });
  protected readonly contagem = computed(() => {
    const lista = this.itens() ?? [];
    const conta = (s: StatusItem) => lista.filter((i) => i.status === s).length;
    return { todos: lista.length, proposto: conta('PROPOSTO'), aprovado: conta('APROVADO'), rejeitado: conta('REJEITADO') };
  });

  /** Unidades cobertas pelo contrato (alvo de metas). */
  protected readonly unidadesDoContrato = computed(() => {
    const raiz = this.detalhe()?.contrato.unidadeId;
    if (!raiz || !this.dadosUnidades.hasValue()) {
      return [];
    }
    return arvoreDeUnidades(subarvore(this.dadosUnidades.value(), raiz)).filter((o) => o.tipo !== 'ETE' && o.tipo !== 'EEE');
  });

  protected readonly tipos = Object.entries(TIPOS_ITEM).map(([codigo, info]) => ({ codigo: codigo as TipoItem, ...info }));
  protected readonly fmt = { data, dataEHora, haQuantoTempo, numero, percentual, referencia };
  protected readonly situacaoDoc = (d: DocumentoContrato) => SITUACOES_DOCUMENTO[d.situacao];
  protected readonly statusItem = (i: ItemContratual) => STATUS_ITEM[i.status];
  protected readonly tipoItem = (i: { tipo: TipoItem }) => TIPOS_ITEM[i.tipo];
  protected readonly rotuloTipo = (tipo: TipoItem) => TIPOS_ITEM[tipo].rotulo;
  protected readonly diferencas = diferencasDaIa;

  constructor() {
    // Enquanto algum documento está sendo processado, consulta de novo a cada 2 s.
    const destruir = inject(DestroyRef);
    let espera: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      clearTimeout(espera);
      if (this.processando() && !this.dados.isLoading()) {
        espera = setTimeout(() => {
          this.dados.reload();
          this.dadosItens.reload();
        }, 2000);
      }
    });
    destruir.onDestroy(() => clearTimeout(espera));
  }

  // ----- Envio de documentos -----
  protected readonly tipoDocumento = new FormControl<'ORIGINAL' | 'ANEXO' | 'ADITIVO'>('ORIGINAL', { nonNullable: true });
  protected readonly enviando = signal(false);
  protected readonly arrastando = signal(false);

  protected soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastando.set(false);
    const arquivo = evento.dataTransfer?.files?.[0];
    if (arquivo) {
      void this.enviar(arquivo);
    }
  }

  protected escolher(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const arquivo = campo.files?.[0];
    campo.value = '';
    if (arquivo) {
      void this.enviar(arquivo);
    }
  }

  private async enviar(arquivo: File): Promise<void> {
    if (arquivo.type && arquivo.type !== 'application/pdf') {
      this.avisos.open('Envie um arquivo PDF.', 'Fechar', { duration: 6000 });
      return;
    }
    const corpo = new FormData();
    corpo.append('arquivo', arquivo, arquivo.name);
    this.enviando.set(true);
    try {
      await firstValueFrom(
        this.http.post(`/api/v1/contratos/${this.id()}/documentos`, corpo, { params: { tipo: this.tipoDocumento.value } }),
      );
      this.avisos.open(`${arquivo.name} enviado. A leitura começou.`, undefined, { duration: 4000 });
      this.dados.reload();
    } catch (falha) {
      this.avisos.open(mensagemDeErro(falha, 'Não foi possível enviar o arquivo.'), 'Fechar', { duration: 8000 });
    } finally {
      this.enviando.set(false);
    }
  }

  protected async reprocessar(d: DocumentoContrato): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`/api/v1/contratos/documentos/${d.id}/processamento`, null));
      this.avisos.open(`Reprocessando ${d.titulo}.`, undefined, { duration: 4000 });
      this.dados.reload();
    } catch (falha) {
      this.avisos.open(mensagemDeErro(falha), 'Fechar', { duration: 8000 });
    }
  }

  // ----- PDF (A4) -----
  /** PDFs já baixados nesta tela (com o token; o visualizador recebe os bytes). */
  private readonly pdfs = new Map<string, ArrayBuffer>();
  protected readonly pdfDados = signal<ArrayBuffer | null>(null);
  protected readonly pdfPagina = signal(1);
  protected readonly carregandoPdf = signal(false);
  protected readonly erroPdf = signal(false);

  protected async mostrarPdf(documento: string, pagina: number): Promise<void> {
    this.pdfPagina.set(pagina);
    const dados = await this.baixarPdf(documento);
    this.pdfDados.set(dados);
  }

  private async baixarPdf(documento: string): Promise<ArrayBuffer | null> {
    const guardado = this.pdfs.get(documento);
    if (guardado) {
      return guardado;
    }
    this.carregandoPdf.set(true);
    this.erroPdf.set(false);
    try {
      const dados = await firstValueFrom(
        this.http.get(`/api/v1/contratos/documentos/${documento}/arquivo`, { responseType: 'arraybuffer' }),
      );
      this.pdfs.set(documento, dados);
      return dados;
    } catch {
      this.erroPdf.set(true);
      return null;
    } finally {
      this.carregandoPdf.set(false);
    }
  }

  /** Abre o PDF numa aba, com o visualizador do navegador. */
  protected async mostrarPdfAvulso(documento: DocumentoContrato): Promise<void> {
    const aba = window.open('', '_blank');
    const dados = await this.baixarPdf(documento.id);
    if (aba && dados) {
      const url = URL.createObjectURL(new Blob([dados], { type: 'application/pdf' }));
      aba.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      aba?.close();
    }
  }

  // ----- Revisão -----
  private readonly modeloRevisao = viewChild.required<TemplateRef<unknown>>('modeloRevisao');
  private dialogoAberto?: MatDialogRef<unknown>;
  protected readonly emRevisao = signal<ItemContratual | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly rejeitando = signal(false);
  protected readonly motivo = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] });

  protected readonly formulario = new FormGroup({
    documentoId: new FormControl<string | null>(null, Validators.required),
    tipo: new FormControl<TipoItem>('OBRIGACAO', { nonNullable: true }),
    titulo: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    resumo: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(2000)] }),
    clausula: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(40)] }),
    pagina: new FormControl<number>(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    trecho: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(4000)] }),
    valorReferencia: new FormControl<number | null>(null),
    unidadeMedida: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(40)] }),
    dataLimite: new FormControl<Date | null>(null),
    periodicidade: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(60)] }),
    unidade: new FormControl<OpcaoUnidade | string | null>(null),
    valorAlerta: new FormControl<number | null>(null, [Validators.min(0), Validators.max(100)]),
    vigenciaInicio: new FormControl<Date | null>(null),
  });
  private readonly tipoEscolhido = toSignal(this.formulario.controls.tipo.valueChanges, { initialValue: 'OBRIGACAO' as TipoItem });
  protected readonly ehMeta = computed(() => this.tipoEscolhido() === 'META');
  /** O trecho digitado é destacado no PDF enquanto a pessoa revisa. */
  protected readonly trechoAtual = toSignal(this.formulario.controls.trecho.valueChanges.pipe(debounceTime(300)), { initialValue: '' });
  private readonly textoUnidade = toSignal(this.formulario.controls.unidade.valueChanges, { initialValue: null });
  protected readonly opcoesUnidade = computed(() => {
    const texto = this.textoUnidade();
    return typeof texto === 'string' ? filtrarUnidades(this.unidadesDoContrato(), texto) : this.unidadesDoContrato();
  });
  protected readonly exibirUnidade = (o: OpcaoUnidade | string | null) => (o && typeof o === 'object' ? o.caminho : (o ?? ''));
  protected readonly documentosParaItem = computed(() =>
    (this.detalhe()?.documentos ?? []).filter((d) => !SITUACOES_DOCUMENTO[d.situacao].andamento && d.situacao !== 'FALHA'),
  );

  protected abrirRevisao(item: ItemContratual): void {
    this.prepararDialogo(item);
    this.formulario.reset({
      documentoId: item.documentoId,
      tipo: item.tipo,
      titulo: item.titulo,
      resumo: item.resumo,
      clausula: item.clausula ?? '',
      pagina: item.pagina,
      trecho: item.trecho,
      valorReferencia: item.valorReferencia ?? null,
      unidadeMedida: item.unidadeMedida ?? '',
      dataLimite: deIso(item.dataLimite),
      periodicidade: item.periodicidade ?? '',
      unidade: this.unidadesDoContrato().find((o) => o.id === item.unidadeId) ?? null,
      valorAlerta: item.valorAlerta ?? null,
      vigenciaInicio: deIso(item.vigenciaInicio),
    });
    if (item.status === 'PROPOSTO' && this.podeGerir()) {
      this.formulario.enable();
    } else {
      this.formulario.disable();
    }
    this.formulario.controls.documentoId.disable();
    void this.mostrarPdf(item.documentoId, item.pagina);
  }

  protected abrirNovoItem(): void {
    this.prepararDialogo(null);
    const documento = this.documentosParaItem()[0];
    this.formulario.reset({ documentoId: documento?.id ?? null, tipo: 'OBRIGACAO', pagina: 1 });
    this.formulario.enable();
    if (documento) {
      void this.mostrarPdf(documento.id, 1);
    }
  }

  protected irParaPagina(): void {
    const documento = this.formulario.controls.documentoId.value;
    if (documento) {
      void this.mostrarPdf(documento, this.formulario.controls.pagina.value || 1);
    }
  }

  protected fechar(): void {
    this.dialogoAberto?.close();
  }

  protected async salvar(): Promise<void> {
    const pedido = this.pedido();
    const item = this.emRevisao();
    if (!pedido) {
      return;
    }
    await this.enviarRevisao(
      () =>
        item
          ? this.http.put(`/api/v1/contratos/itens/${item.id}`, pedido)
          : this.http.post(`/api/v1/contratos/${this.id()}/itens`, { documentoId: this.formulario.controls.documentoId.value, item: pedido }),
      item ? 'Alterações salvas.' : 'Item cadastrado. Ele ainda precisa ser aprovado.',
    );
  }

  /** Grava as alterações pendentes e aprova. */
  protected async aprovar(): Promise<void> {
    const item = this.emRevisao();
    const pedido = this.pedido();
    if (!item || !pedido) {
      return;
    }
    const alterado = this.formulario.dirty;
    await this.enviarRevisao(async () => {
      if (alterado) {
        await firstValueFrom(this.http.put(`/api/v1/contratos/itens/${item.id}`, pedido));
      }
      return this.http.post(`/api/v1/contratos/itens/${item.id}/aprovacao`, null);
    }, item.tipo === 'META' || pedido.tipo === 'META' ? 'Item aprovado e meta criada.' : 'Item aprovado.');
  }

  protected async rejeitar(): Promise<void> {
    const item = this.emRevisao();
    if (!item) {
      return;
    }
    if (!this.rejeitando()) {
      this.rejeitando.set(true);
      return;
    }
    if (this.motivo.invalid) {
      this.motivo.markAsTouched();
      return;
    }
    await this.enviarRevisao(
      () => this.http.post(`/api/v1/contratos/itens/${item.id}/rejeicao`, { motivo: this.motivo.value.trim() }),
      'Item rejeitado.',
    );
  }

  private prepararDialogo(item: ItemContratual | null): void {
    this.erro.set(null);
    this.rejeitando.set(false);
    this.motivo.reset('');
    this.emRevisao.set(item);
    this.pdfDados.set(null);
    this.dialogoAberto = this.dialogos.open(this.modeloRevisao(), {
      width: '1320px',
      height: 'min(900px, calc(100vh - 32px))',
      autoFocus: 'dialog',
      panelClass: 'dialogo-revisao',
    });
  }

  private pedido(): PedidoItem | null {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      this.erro.set('Confira os campos destacados.');
      return null;
    }
    const v = this.formulario.getRawValue();
    const unidade = v.unidade && typeof v.unidade === 'object' ? v.unidade.id : null;
    if (typeof v.unidade === 'string' && v.unidade.trim()) {
      this.erro.set('Escolha a unidade na lista.');
      return null;
    }
    return {
      tipo: v.tipo,
      titulo: v.titulo.trim(),
      resumo: v.resumo.trim(),
      clausula: v.clausula.trim() || null,
      pagina: v.pagina,
      trecho: v.trecho.trim(),
      valorReferencia: v.valorReferencia,
      unidadeMedida: v.unidadeMedida.trim() || null,
      dataLimite: paraIso(v.dataLimite),
      periodicidade: v.periodicidade.trim() || null,
      unidadeId: v.tipo === 'META' ? unidade : null,
      valorAlerta: v.tipo === 'META' ? v.valorAlerta : null,
      vigenciaInicio: v.tipo === 'META' ? paraIso(v.vigenciaInicio) : null,
    };
  }

  private async enviarRevisao(acao: () => Observable<unknown> | Promise<Observable<unknown>>, sucesso: string): Promise<void> {
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await firstValueFrom(await acao());
      this.dialogoAberto?.close();
      this.avisos.open(sucesso, undefined, { duration: 4000 });
      this.dadosItens.reload();
      this.dados.reload();
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
      // Edição gravada antes de uma aprovação recusada: a lista precisa refletir.
      this.dadosItens.reload();
    } finally {
      this.salvando.set(false);
    }
  }
}
