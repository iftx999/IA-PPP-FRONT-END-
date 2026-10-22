import { HttpClient, httpResource } from '@angular/common/http';
import { Component, TemplateRef, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, type ValidatorFn } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, firstValueFrom, type Observable } from 'rxjs';
import type { CodigoTipoUnidade, NoArvore, PedidoDadosUnidade, PedidoNovaUnidade, TipoUnidade } from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { semAcento } from '../../nucleo/unidades-arvore';
import { Selo } from '../../ui/selo';
import { ICONES, caminhoDe, destinosParaMover, linhasVisiveis, tiposFilhos } from './arvore';

const GERIR_UNIDADES = 'unidade:gerenciar';

const daLista: ValidatorFn = (c) => (c.value && typeof c.value === 'object' ? null : { escolha: true });

/** Cadastro de unidades (H1): árvore Grupo → Concessão → Município → Setor/ETE/EEE. */
@Component({
  selector: 'aurora-unidades',
  imports: [
    ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatAutocompleteModule, MatSlideToggleModule, MatTooltipModule, MatProgressSpinnerModule, MatSnackBarModule, Selo,
  ],
  templateUrl: './unidades.html',
  styleUrl: './unidades.scss',
})
export class Unidades {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly avisos = inject(MatSnackBar);
  protected readonly sessao = inject(SessaoService);

  private readonly podeGerir = computed(() => this.sessao.pode(GERIR_UNIDADES));
  protected readonly dados = httpResource<NoArvore[]>(() => (this.podeGerir() ? '/api/v1/unidades/arvore' : undefined));
  private readonly dadosTipos = httpResource<TipoUnidade[]>(() => (this.podeGerir() ? '/api/v1/unidades/tipos' : undefined));

  /** Mantém a última lista durante o recarregamento, para a árvore não piscar depois de salvar. */
  protected readonly nos = linkedSignal<NoArvore[] | undefined, NoArvore[] | undefined>({
    source: () => (this.dados.hasValue() ? this.dados.value() : undefined),
    computation: (atual, anterior) => atual ?? anterior?.value,
  });
  protected readonly tipos = computed(() => (this.dadosTipos.hasValue() ? this.dadosTipos.value() : []));

  protected readonly resumo = computed(() => {
    const lista = this.nos() ?? [];
    const conta = (tipo: CodigoTipoUnidade) => lista.filter((n) => n.ativo && n.tipo === tipo).length;
    return {
      concessoes: conta('CONCESSAO'),
      municipios: conta('MUNICIPIO'),
      setores: conta('SETOR_COMERCIAL'),
      estacoes: conta('ETE') + conta('EEE'),
      inativas: lista.filter((n) => !n.ativo).length,
    };
  });

  // ----- Árvore -----
  protected readonly busca = new FormControl('', { nonNullable: true });
  private readonly termo = toSignal(this.busca.valueChanges.pipe(debounceTime(150)), { initialValue: '' });
  protected readonly mostrarInativas = signal(false);
  private readonly fechadas = signal(new Set<string>());
  protected readonly linhas = computed(() =>
    linhasVisiveis(this.nos() ?? [], this.fechadas(), this.termo(), this.mostrarInativas()),
  );

  protected readonly selecionadaId = signal<string | null>(null);
  protected readonly selecionada = computed(() => {
    const lista = this.nos() ?? [];
    return lista.find((n) => n.id === this.selecionadaId()) ?? lista.find((n) => !n.unidadePaiId) ?? null;
  });
  protected readonly caminhoSelecionada = computed(() => {
    const s = this.selecionada();
    return s ? caminhoDe(this.nos() ?? [], s.id) : '';
  });
  protected readonly podeCriarAbaixo = computed(() => {
    const s = this.selecionada();
    return !!s && s.ativo && tiposFilhos(this.tipos(), s).length > 0;
  });

  protected readonly fmt = { numero };
  protected readonly icone = (tipo: CodigoTipoUnidade) => ICONES[tipo];
  protected descricaoTipo(tipo: CodigoTipoUnidade): string {
    return this.tipos().find((t) => t.codigo === tipo)?.descricao ?? tipo;
  }

  protected alternar(id: string, evento?: Event): void {
    evento?.stopPropagation();
    this.fechadas.update((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) {
        novo.delete(id);
      } else {
        novo.add(id);
      }
      return novo;
    });
  }

  protected selecionar(no: NoArvore): void {
    this.selecionadaId.set(no.id);
  }

  /** Setas e Enter na árvore (padrão de treeview do WAI-ARIA, simplificado). */
  protected teclado(evento: KeyboardEvent, no: NoArvore, aberta: boolean, temFilhas: boolean): void {
    const linhas = this.linhas();
    const i = linhas.findIndex((l) => l.no.id === no.id);
    const focar = (alvo: number) => {
      const destino = linhas[alvo];
      if (destino) {
        this.selecionadaId.set(destino.no.id);
        queueMicrotask(() => document.getElementById(`no-${destino.no.id}`)?.focus());
      }
    };
    switch (evento.key) {
      case 'ArrowDown': focar(i + 1); break;
      case 'ArrowUp': focar(i - 1); break;
      case 'ArrowRight': if (temFilhas && !aberta) { this.alternar(no.id); } else { focar(i + 1); } break;
      case 'ArrowLeft':
        if (temFilhas && aberta) {
          this.alternar(no.id);
        } else {
          focar(linhas.findIndex((l) => l.no.id === no.unidadePaiId));
        }
        break;
      default: return;
    }
    evento.preventDefault();
  }

  // ----- Diálogos -----
  private readonly modeloEditor = viewChild.required<TemplateRef<unknown>>('modeloEditor');
  private readonly modeloMover = viewChild.required<TemplateRef<unknown>>('modeloMover');
  private readonly modeloInativar = viewChild.required<TemplateRef<unknown>>('modeloInativar');
  private dialogoAberto?: MatDialogRef<unknown>;

  protected readonly modo = signal<'nova' | 'editar'>('nova');
  protected readonly paiDaNova = signal<NoArvore | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly formulario = new FormGroup({
    tipo: new FormControl<CodigoTipoUnidade | null>(null, Validators.required),
    codigo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(40), Validators.pattern(/^\s*[A-Za-z0-9][A-Za-z0-9_.-]*\s*$/)],
    }),
    nome: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    codigoIbge: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d{7}$/)] }),
    latitude: new FormControl<number | null>(null, [Validators.min(-90), Validators.max(90)]),
    longitude: new FormControl<number | null>(null, [Validators.min(-180), Validators.max(180)]),
  });
  private readonly tipoEscolhido = toSignal(this.formulario.controls.tipo.valueChanges, { initialValue: null });
  protected readonly exigeIbge = computed(
    () => this.tipos().find((t) => t.codigo === this.tipoEscolhido())?.exigeCodigoIbge ?? false,
  );
  protected readonly tiposDaNova = computed(() => {
    const pai = this.paiDaNova();
    return pai ? tiposFilhos(this.tipos(), pai) : [];
  });

  protected readonly destino = new FormControl<NoArvore | string | null>(null, [Validators.required, daLista]);
  /** Formulário do diálogo de mover (sem ele, o submit seria o nativo do navegador). */
  protected readonly formMover = new FormGroup({ destino: this.destino });
  private readonly textoDestino = toSignal(this.destino.valueChanges, { initialValue: null });
  protected readonly opcoesDestino = computed(() => {
    const unidade = this.selecionada();
    if (!unidade) {
      return [];
    }
    const texto = this.textoDestino();
    const termo = typeof texto === 'string' ? semAcento(texto.trim()) : '';
    const nos = this.nos() ?? [];
    return destinosParaMover(nos, this.tipos(), unidade)
      .map((n) => ({ no: n, caminho: caminhoDe(nos, n.id) }))
      .filter((o) => !termo || semAcento(o.caminho).includes(termo));
  });
  protected readonly exibirDestino = (n: NoArvore | string | null) =>
    n && typeof n === 'object' ? caminhoDe(this.nos() ?? [], n.id) : (n ?? '');

  protected abrirNova(pai: NoArvore): void {
    this.prepararEditor('nova');
    this.paiDaNova.set(pai);
    const tipos = tiposFilhos(this.tipos(), pai);
    this.formulario.reset({ tipo: tipos.length === 1 ? tipos[0]!.codigo : null, codigo: '', nome: '', codigoIbge: '', latitude: null, longitude: null });
    this.formulario.controls.tipo.enable();
    this.dialogoAberto = this.dialogos.open(this.modeloEditor(), { width: '620px', autoFocus: 'first-tabbable' });
  }

  protected abrirEdicao(no: NoArvore): void {
    this.prepararEditor('editar');
    this.formulario.reset({
      tipo: no.tipo, codigo: no.codigo, nome: no.nome, codigoIbge: no.codigoIbge ?? '',
      latitude: no.latitude, longitude: no.longitude,
    });
    this.formulario.controls.tipo.disable();
    this.dialogoAberto = this.dialogos.open(this.modeloEditor(), { width: '620px', autoFocus: 'first-tabbable' });
  }

  protected abrirMover(): void {
    this.erro.set(null);
    this.destino.reset(null);
    this.dialogoAberto = this.dialogos.open(this.modeloMover(), { width: '560px', autoFocus: 'first-tabbable' });
  }

  protected abrirInativacao(): void {
    this.erro.set(null);
    this.dialogoAberto = this.dialogos.open(this.modeloInativar(), { width: '480px' });
  }

  protected async salvar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const v = this.formulario.getRawValue();
    if ((v.latitude == null) !== (v.longitude == null)) {
      this.erro.set('Informe latitude e longitude juntas, ou deixe as duas em branco.');
      return;
    }
    const dados: PedidoDadosUnidade = {
      codigo: v.codigo.trim(),
      nome: v.nome.trim(),
      codigoIbge: this.exigeIbge() ? v.codigoIbge.trim() : null,
      latitude: v.latitude,
      longitude: v.longitude,
    };
    if (this.modo() === 'nova') {
      const pedido: PedidoNovaUnidade = { tipo: v.tipo!, unidadePaiId: this.paiDaNova()!.id, dados };
      await this.enviar(() => this.http.post<{ id: string }>('/api/v1/unidades', pedido), `${dados.nome} criada.`, (r) => {
        const criada = r as { id: string } | null;
        if (criada?.id) {
          this.selecionadaId.set(criada.id);
        }
      });
    } else {
      const no = this.selecionada()!;
      await this.enviar(() => this.http.put(`/api/v1/unidades/${no.id}`, dados), `${dados.nome} atualizada.`);
    }
  }

  protected async mover(): Promise<void> {
    const no = this.selecionada();
    const destino = this.destino.value;
    if (!no || this.destino.invalid || !destino || typeof destino !== 'object') {
      this.destino.markAsTouched();
      return;
    }
    await this.enviar(
      () => this.http.put(`/api/v1/unidades/${no.id}/pai`, { unidadePaiId: destino.id }),
      `${no.nome} agora fica em ${destino.nome}.`,
    );
  }

  protected async confirmarInativacao(): Promise<void> {
    const no = this.selecionada();
    if (no) {
      await this.enviar(() => this.http.put(`/api/v1/unidades/${no.id}/situacao`, { ativo: false }), `${no.nome} inativada.`, () =>
        this.mostrarInativas.set(true),
      );
    }
  }

  protected async reativar(no: NoArvore): Promise<void> {
    try {
      await firstValueFrom(this.http.put(`/api/v1/unidades/${no.id}/situacao`, { ativo: true }));
      this.concluido(`${no.nome} reativada.`);
    } catch (falha) {
      this.avisos.open(mensagemDeErro(falha), 'Fechar', { duration: 8000 });
    }
  }

  protected fechar(): void {
    this.dialogoAberto?.close();
  }

  private prepararEditor(modo: 'nova' | 'editar'): void {
    this.erro.set(null);
    this.modo.set(modo);
  }

  private async enviar(requisicao: () => Observable<unknown>, sucesso: string, depois?: (resposta: unknown) => void): Promise<void> {
    this.salvando.set(true);
    this.erro.set(null);
    try {
      const resposta = await firstValueFrom(requisicao());
      this.dialogoAberto?.close();
      depois?.(resposta);
      this.concluido(sucesso);
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }

  private concluido(mensagem: string): void {
    this.avisos.open(mensagem, undefined, { duration: 4000 });
    this.dados.reload();
  }
}
