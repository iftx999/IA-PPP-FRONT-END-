import { NgTemplateOutlet } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, TemplateRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators, type ValidatorFn } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorIntl, MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, firstValueFrom, map, type Observable } from 'rxjs';
import type { PedidoConcessoes, PedidoConvite, Perfil, SituacaoUsuario, Unidade, Usuario } from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { data, dataEHora, haQuantoTempo, numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { Selo, type Tom } from '../../ui/selo';
import { GERIR_USUARIOS } from '../perfis/perfis';
import { arvoreDeUnidades, filtrarUnidades, semAcento, type OpcaoUnidade } from '../../nucleo/unidades-arvore';

type Filtro = 'TODOS' | SituacaoUsuario;

export const SITUACOES: Record<SituacaoUsuario, { rotulo: string; tom: Tom }> = {
  ATIVO: { rotulo: 'Ativo', tom: 'ok' },
  CONVITE_PENDENTE: { rotulo: 'Convite pendente', tom: 'atencao' },
  INATIVO: { rotulo: 'Inativo', tom: 'neutro' },
};

/** Filtra por situação e por nome ou e-mail (sem diferenciar acentos). */
export function filtrarUsuarios(usuarios: Usuario[], situacao: Filtro, termo: string): Usuario[] {
  const t = semAcento(termo.trim());
  return usuarios.filter(
    (u) =>
      (situacao === 'TODOS' || u.situacao === situacao) &&
      (!t || semAcento(u.nome).includes(t) || semAcento(u.email).includes(t)),
  );
}

export function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]!.toUpperCase())
    .join('');
}

/** Fim do dia escolhido, no fuso local: a concessão vale durante todo o último dia. */
export function fimDoDia(dia: Date): string {
  return new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 23, 59, 59).toISOString();
}

type LinhaConcessao = FormGroup<{
  perfilId: FormControl<string | null>;
  unidade: FormControl<OpcaoUnidade | string | null>;
  validoAte: FormControl<Date | null>;
}>;

const unidadeDaLista: ValidatorFn = (c) => (c.value && typeof c.value === 'object' ? null : { escolha: true });

/** Rótulos do paginador em português. */
class PaginadorPtBr extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Por página';
  override nextPageLabel = 'Próxima página';
  override previousPageLabel = 'Página anterior';
  override firstPageLabel = 'Primeira página';
  override lastPageLabel = 'Última página';
  override getRangeLabel = (pagina: number, tamanho: number, total: number) =>
    total === 0 ? '0 de 0' : `${pagina * tamanho + 1}–${Math.min((pagina + 1) * tamanho, total)} de ${numero(total)}`;
}

/** Usuários do tenant (H2, H7, H8): convite, perfis por unidade, ativação e redefinição de senha. */
@Component({
  selector: 'aurora-usuarios',
  imports: [
    NgTemplateOutlet, ReactiveFormsModule, MatTableModule, MatPaginatorModule, MatButtonModule, MatButtonToggleModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatAutocompleteModule, MatDatepickerModule, MatDialogModule,
    MatMenuModule, MatTooltipModule, MatProgressSpinnerModule, MatSnackBarModule, Selo,
  ],
  providers: [{ provide: MatPaginatorIntl, useClass: PaginadorPtBr }],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
})
export class Usuarios {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly avisos = inject(MatSnackBar);
  protected readonly sessao = inject(SessaoService);

  private readonly podeGerir = computed(() => this.sessao.pode(GERIR_USUARIOS));
  protected readonly dados = httpResource<Usuario[]>(() => (this.podeGerir() ? '/api/v1/usuarios' : undefined));
  private readonly dadosPerfis = httpResource<Perfil[]>(() => (this.podeGerir() ? '/api/v1/perfis' : undefined));
  private readonly dadosUnidades = httpResource<Unidade[]>(() => (this.podeGerir() ? '/api/v1/unidades' : undefined));

  protected readonly usuarios = computed(() => (this.dados.hasValue() ? this.dados.value() : undefined));
  protected readonly perfis = computed(() =>
    this.dadosPerfis.hasValue()
      ? [...this.dadosPerfis.value()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      : [],
  );
  protected readonly unidades = computed(() =>
    this.dadosUnidades.hasValue() ? arvoreDeUnidades(this.dadosUnidades.value()) : [],
  );

  protected readonly resumo = computed(() => {
    const lista = this.usuarios() ?? [];
    const conta = (s: SituacaoUsuario) => lista.filter((u) => u.situacao === s).length;
    return { total: lista.length, ativos: conta('ATIVO'), pendentes: conta('CONVITE_PENDENTE'), inativos: conta('INATIVO') };
  });

  // ----- Filtros e paginação (no cliente: a lista vem inteira, ver ADR 0011) -----
  protected readonly busca = new FormControl('', { nonNullable: true });
  private readonly termo = toSignal(this.busca.valueChanges.pipe(debounceTime(150)), { initialValue: '' });
  protected readonly filtroSituacao = signal<Filtro>('TODOS');
  protected readonly pagina = signal({ indice: 0, tamanho: 25 });
  private readonly paginador = viewChild(MatPaginator);

  protected readonly filtrados = computed(() =>
    filtrarUsuarios(this.usuarios() ?? [], this.filtroSituacao(), this.termo()),
  );
  protected readonly visiveis = computed(() => {
    const { indice, tamanho } = this.pagina();
    return this.filtrados().slice(indice * tamanho, (indice + 1) * tamanho);
  });

  protected readonly colunas = ['usuario', 'acesso', 'situacao', 'ultimoAcesso', 'acoes'];
  protected readonly fmt = { numero, data, dataEHora, haQuantoTempo, iniciais };
  protected readonly rastrear = (_: number, u: Usuario) => u.id;

  constructor() {
    // Novo filtro: volta para a primeira página.
    effect(() => {
      this.filtroSituacao();
      this.termo();
      this.pagina.update((p) => ({ ...p, indice: 0 }));
      this.paginador()?.firstPage();
    });
  }

  protected mudarPagina(evento: PageEvent): void {
    this.pagina.set({ indice: evento.pageIndex, tamanho: evento.pageSize });
  }

  protected situacao(u: Usuario): { rotulo: string; tom: Tom } {
    return SITUACOES[u.situacao];
  }

  protected souEu(u: Usuario): boolean {
    return u.id === this.sessao.usuario()?.usuarioId;
  }

  // ----- Diálogos -----
  private readonly modeloConvite = viewChild.required<TemplateRef<unknown>>('modeloConvite');
  private readonly modeloAcesso = viewChild.required<TemplateRef<unknown>>('modeloAcesso');
  private readonly modeloDesativar = viewChild.required<TemplateRef<unknown>>('modeloDesativar');
  private dialogoAberto?: MatDialogRef<unknown>;

  protected readonly emEdicao = signal<Usuario | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly amanha = new Date(Date.now() + 86_400_000);

  protected readonly convite = new FormGroup({
    nome: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
  });
  protected readonly concessoes = new FormArray<LinhaConcessao>([]);
  /** Formulário do diálogo de acesso (só as concessões). */
  protected readonly acesso = new FormGroup({ concessoes: this.concessoes });

  protected readonly exibirUnidade = (o: OpcaoUnidade | string | null) =>
    o && typeof o === 'object' ? o.caminho : (o ?? '');

  /** Opções do autocomplete de uma linha, filtradas pelo que foi digitado nela. */
  protected opcoesPara(linha: LinhaConcessao): OpcaoUnidade[] {
    const valor = linha.controls.unidade.value;
    return typeof valor === 'string' ? filtrarUnidades(this.unidades(), valor) : this.unidades();
  }

  protected adicionarConcessao(perfilId: string | null = null, unidade: OpcaoUnidade | null = null, validoAte: Date | null = null): void {
    this.concessoes.push(
      new FormGroup({
        perfilId: new FormControl<string | null>(perfilId, Validators.required),
        unidade: new FormControl<OpcaoUnidade | string | null>(unidade, [Validators.required, unidadeDaLista]),
        validoAte: new FormControl<Date | null>(validoAte),
      }),
    );
  }

  protected removerConcessao(indice: number): void {
    this.concessoes.removeAt(indice);
  }

  protected abrirConvite(): void {
    this.erro.set(null);
    this.emEdicao.set(null);
    this.convite.reset({ nome: '', email: '' });
    this.concessoes.clear();
    this.adicionarConcessao();
    this.dialogoAberto = this.dialogos.open(this.modeloConvite(), { width: '760px', autoFocus: 'first-tabbable' });
  }

  protected abrirAcesso(u: Usuario): void {
    this.erro.set(null);
    this.emEdicao.set(u);
    this.concessoes.clear();
    for (const c of u.concessoes) {
      const unidade = this.unidades().find((o) => o.id === c.unidadeId) ?? null;
      this.adicionarConcessao(c.perfilId, unidade, c.validoAte ? new Date(c.validoAte) : null);
    }
    if (u.concessoes.length === 0) {
      this.adicionarConcessao();
    }
    this.dialogoAberto = this.dialogos.open(this.modeloAcesso(), { width: '760px', autoFocus: 'dialog' });
  }

  protected abrirDesativacao(u: Usuario): void {
    this.erro.set(null);
    this.emEdicao.set(u);
    this.dialogoAberto = this.dialogos.open(this.modeloDesativar(), { width: '480px' });
  }

  protected async enviarConvite(): Promise<void> {
    if (this.convite.invalid || this.concessoes.invalid) {
      this.convite.markAllAsTouched();
      this.concessoes.markAllAsTouched();
      return;
    }
    const v = this.convite.getRawValue();
    const pedido: PedidoConvite = { nome: v.nome.trim(), email: v.email.trim(), concessoes: this.pedidoConcessoes() };
    await this.enviar(() => this.http.post('/api/v1/usuarios', pedido), `Convite enviado para ${pedido.email}.`);
  }

  protected async salvarAcesso(): Promise<void> {
    const u = this.emEdicao();
    if (!u) {
      return;
    }
    if (this.concessoes.invalid) {
      this.concessoes.markAllAsTouched();
      return;
    }
    const pedido: PedidoConcessoes = { concessoes: this.pedidoConcessoes() };
    await this.enviar(
      () => this.http.put(`/api/v1/usuarios/${u.id}/concessoes`, pedido),
      `Acesso de ${u.nome} atualizado.`,
    );
  }

  protected async confirmarDesativacao(): Promise<void> {
    const u = this.emEdicao();
    if (u) {
      await this.enviar(
        () => this.http.put(`/api/v1/usuarios/${u.id}/situacao`, { ativo: false }),
        `Acesso de ${u.nome} desativado.`,
      );
    }
  }

  protected async reativar(u: Usuario): Promise<void> {
    await this.acaoDireta(() => this.http.put(`/api/v1/usuarios/${u.id}/situacao`, { ativo: true }), `Acesso de ${u.nome} reativado.`);
  }

  protected async reenviarConvite(u: Usuario): Promise<void> {
    await this.acaoDireta(() => this.http.post(`/api/v1/usuarios/${u.id}/convite`, null), `Convite reenviado para ${u.email}.`);
  }

  protected async redefinirSenha(u: Usuario): Promise<void> {
    await this.acaoDireta(
      () => this.http.post(`/api/v1/usuarios/${u.id}/redefinicao-senha`, null),
      `Link para nova senha enviado para ${u.email}.`,
    );
  }

  protected fechar(): void {
    this.dialogoAberto?.close();
  }

  private pedidoConcessoes(): PedidoConvite['concessoes'] {
    return this.concessoes.getRawValue().map((c) => ({
      perfilId: c.perfilId!,
      unidadeId: (c.unidade as OpcaoUnidade).id,
      validoAte: c.validoAte ? fimDoDia(c.validoAte) : null,
    }));
  }

  /** Ação de diálogo: erros aparecem dentro do diálogo, que só fecha no sucesso. */
  private async enviar(requisicao: () => Observable<unknown>, sucesso: string): Promise<void> {
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await firstValueFrom(requisicao());
      this.dialogoAberto?.close();
      this.concluido(sucesso);
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }

  /** Ação do menu da linha: resultado num aviso rápido. */
  private async acaoDireta(requisicao: () => Observable<unknown>, sucesso: string): Promise<void> {
    try {
      await firstValueFrom(requisicao().pipe(map(() => true)));
      this.concluido(sucesso);
    } catch (falha) {
      this.avisos.open(mensagemDeErro(falha), 'Fechar', { duration: 8000 });
    }
  }

  private concluido(mensagem: string): void {
    this.avisos.open(mensagem, undefined, { duration: 4000 });
    this.dados.reload();
    this.dadosPerfis.reload();
    // A pessoa pode ter mudado o próprio acesso: as permissões efetivas vêm de /eu.
    this.sessao.eu.reload();
  }
}
