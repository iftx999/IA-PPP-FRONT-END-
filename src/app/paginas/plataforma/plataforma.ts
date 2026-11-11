import { NgTemplateOutlet } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { debounceTime, firstValueFrom, map, type Observable } from 'rxjs';
import type {
  ClientePlataforma,
  LimitesCliente,
  PedidoAlteracaoCliente,
  PedidoNovoCliente,
} from '../../api/tipos';
import { entrarDeNovo } from '../../nucleo/autenticacao';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { filtrosNaUrl } from '../../nucleo/filtros';
import { data, numero } from '../../nucleo/formato';
import { exigeSegundoFator } from '../../nucleo/segundo-fator';
import { semAcento } from '../../nucleo/unidades-arvore';
import { Selo, type Tom } from '../../ui/selo';

/** Código sugerido a partir do nome: minúsculas sem acento, palavras ligadas por hífen (até 40). */
export function sugerirCodigo(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export type SituacaoFiltroCliente = 'ATIVO' | 'PENDENTE' | 'INATIVO';

export function filtrarClientes(
  clientes: readonly ClientePlataforma[],
  termo: string,
  situacao: SituacaoFiltroCliente | null,
): ClientePlataforma[] {
  const t = semAcento(termo.trim());
  return clientes.filter(
    (c) =>
      (!t ||
        semAcento(`${c.nome} ${c.codigo} ${c.contatoNome ?? ''} ${c.contatoEmail ?? ''}`).includes(
          t,
        )) &&
      (!situacao ||
        (situacao === 'PENDENTE'
          ? !c.provisionado
          : c.provisionado && c.ativo === (situacao === 'ATIVO'))),
  );
}

export function situacaoCliente(c: Pick<ClientePlataforma, 'ativo' | 'provisionado'>): {
  rotulo: string;
  tom: Tom;
} {
  if (!c.provisionado) {
    return { rotulo: 'Provisionamento pendente', tom: 'atencao' };
  }
  return c.ativo ? { rotulo: 'Ativo', tom: 'ok' } : { rotulo: 'Inativo', tom: 'neutro' };
}

/** "3 de 10" ou "3" sem limite; perigo quando atinge o limite. */
export function usoDeUsuarios(c: Pick<ClientePlataforma, 'usuariosAtivos' | 'limites'>): {
  texto: string;
  cheio: boolean;
} {
  const limite = c.limites.usuarios;
  return limite == null
    ? { texto: `${numero(c.usuariosAtivos)}`, cheio: false }
    : {
        texto: `${numero(c.usuariosAtivos)} de ${numero(limite)}`,
        cheio: c.usuariosAtivos >= limite,
      };
}

const CODIGO = /^[a-z0-9](-?[a-z0-9])+$/;

/**
 * Administração da plataforma (S1, ADR 0027): clientes, limites, logo e provisionamento. Entra pelo realm da
 * plataforma; nada aqui mostra dados de dentro dos clientes.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'aurora-plataforma',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    Selo,
  ],
  templateUrl: './plataforma.html',
  styleUrl: './plataforma.scss',
})
export class Plataforma {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly avisos = inject(MatSnackBar);
  private readonly oidc = inject(OidcSecurityService);

  protected readonly email = toSignal(
    this.oidc.userData$.pipe(map((d) => (d.userData as { email?: string } | null)?.email ?? '')),
    {
      initialValue: '',
    },
  );
  protected readonly clientes = httpResource<ClientePlataforma[]>(
    () => '/api/v1/plataforma/clientes',
  );
  protected readonly lista = computed(() =>
    this.clientes.hasValue() ? this.clientes.value() : [],
  );
  protected readonly semCodigo = computed(() => exigeSegundoFator(this.clientes.error()));
  protected readonly resumo = computed(() => {
    const l = this.lista();
    return {
      total: l.length,
      ativos: l.filter((c) => c.ativo && c.provisionado).length,
      pendentes: l.filter((c) => !c.provisionado).length,
    };
  });
  protected readonly filtros = filtrosNaUrl(['busca', 'situacao']);
  protected readonly busca = new FormControl(this.filtros.inicial('busca'), { nonNullable: true });
  protected readonly filtroSituacao = computed(
    () => this.filtros.valor('situacao') as SituacaoFiltroCliente | null,
  );
  protected readonly filtrando = computed(() => this.filtros.ativos() > 0);
  protected readonly visiveis = computed(() =>
    filtrarClientes(this.lista(), this.filtros.valor('busca') ?? '', this.filtroSituacao()),
  );
  protected readonly colunas = ['cliente', 'situacao', 'usuarios', 'criado', 'acoes'];
  protected readonly fmt = { data, numero };
  protected readonly situacao = situacaoCliente;
  protected readonly uso = usoDeUsuarios;
  protected readonly mensagemDeErro = mensagemDeErro;

  private readonly modeloNovo = viewChild.required<TemplateRef<unknown>>('modeloNovo');
  private readonly modeloEdicao = viewChild.required<TemplateRef<unknown>>('modeloEdicao');
  private dialogo?: MatDialogRef<unknown>;
  protected readonly emEdicao = signal<ClientePlataforma | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  /** Evita trocar o código que a pessoa já editou à mão. */
  private codigoEditado = false;

  private readonly limites = () =>
    new FormGroup({
      usuarios: new FormControl<number | null>(null, [Validators.min(1)]),
      assistenteTokensPorMes: new FormControl<number | null>(null, [Validators.min(1)]),
      assistenteUsdPorMes: new FormControl<number | null>(null, [Validators.min(0.01)]),
    });

  protected readonly novo = new FormGroup({
    nome: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    codigo: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(40),
        Validators.pattern(CODIGO),
      ],
    }),
    contatoNome: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    contatoEmail: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
    limites: this.limites(),
  });

  protected readonly edicao = new FormGroup({
    nome: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    ativo: new FormControl(true, { nonNullable: true }),
    limites: this.limites(),
  });

  protected limparFiltros(): void {
    this.busca.setValue('', { emitEvent: false });
    this.filtros.limpar();
  }

  constructor() {
    this.busca.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed())
      .subscribe((v) => this.filtros.aplicar({ busca: v.trim() }));
    this.novo.controls.nome.valueChanges.subscribe((nome) => {
      if (!this.codigoEditado) {
        this.novo.controls.codigo.setValue(sugerirCodigo(nome), { emitEvent: false });
      }
    });
  }

  protected codigoDigitado(): void {
    this.codigoEditado = true;
  }

  protected entrarComCodigo(): void {
    entrarDeNovo(this.oidc, '/plataforma');
  }

  protected sair(): void {
    this.oidc.logoff().subscribe();
  }

  protected logo(c: ClientePlataforma): string {
    return `/api/v1/publico/clientes/${c.codigo}/logo`;
  }

  protected abrirNovo(): void {
    this.erro.set(null);
    this.codigoEditado = false;
    this.novo.reset();
    this.dialogo = this.dialogos.open(this.modeloNovo(), {
      width: '640px',
      autoFocus: 'first-tabbable',
    });
  }

  protected abrirEdicao(c: ClientePlataforma): void {
    this.erro.set(null);
    this.emEdicao.set(c);
    this.edicao.reset({ nome: c.nome, ativo: c.ativo, limites: { ...c.limites } });
    this.dialogo = this.dialogos.open(this.modeloEdicao(), { width: '640px', autoFocus: 'dialog' });
  }

  protected async criar(): Promise<void> {
    if (this.novo.invalid) {
      this.novo.markAllAsTouched();
      return;
    }
    const v = this.novo.getRawValue();
    const pedido: PedidoNovoCliente = {
      nome: v.nome.trim(),
      codigo: v.codigo.trim(),
      contatoNome: v.contatoNome.trim(),
      contatoEmail: v.contatoEmail.trim(),
      limites: limitesDoFormulario(v.limites),
    };
    await this.enviar(
      () => this.http.post<ClientePlataforma>('/api/v1/plataforma/clientes', pedido),
      (c) => `Cliente ${c.nome} criado. O convite foi enviado para ${pedido.contatoEmail}.`,
      true,
    );
  }

  protected async salvarEdicao(): Promise<void> {
    const c = this.emEdicao();
    if (!c || this.edicao.invalid) {
      this.edicao.markAllAsTouched();
      return;
    }
    const v = this.edicao.getRawValue();
    const pedido: PedidoAlteracaoCliente = {
      nome: v.nome.trim(),
      ativo: v.ativo,
      limites: limitesDoFormulario(v.limites),
    };
    await this.enviar(
      () => this.http.put<ClientePlataforma>(`/api/v1/plataforma/clientes/${c.id}`, pedido),
      (n) => `${n.nome} atualizado.`,
      true,
    );
  }

  protected async enviarLogo(evento: Event): Promise<void> {
    const c = this.emEdicao();
    const arquivo = (evento.target as HTMLInputElement).files?.[0];
    (evento.target as HTMLInputElement).value = '';
    if (!c || !arquivo) {
      return;
    }
    const corpo = new FormData();
    corpo.append('arquivo', arquivo);
    await this.enviar(
      () => this.http.put<ClientePlataforma>(`/api/v1/plataforma/clientes/${c.id}/logo`, corpo),
      () => 'Logo atualizada.',
      false,
    );
  }

  protected async removerLogo(): Promise<void> {
    const c = this.emEdicao();
    if (c) {
      await this.enviar(
        () => this.http.delete<ClientePlataforma>(`/api/v1/plataforma/clientes/${c.id}/logo`),
        () => 'Logo removida.',
        false,
      );
    }
  }

  protected async concluirProvisionamento(c: ClientePlataforma): Promise<void> {
    await this.acao(
      () => this.http.post(`/api/v1/plataforma/clientes/${c.id}/provisionamento`, null),
      `Provisionamento de ${c.nome} concluído.`,
    );
  }

  protected async reenviarConvite(c: ClientePlataforma): Promise<void> {
    await this.acao(
      () => this.http.post(`/api/v1/plataforma/clientes/${c.id}/convite`, null),
      `Convite reenviado para ${c.contatoEmail}.`,
    );
  }

  protected fechar(): void {
    this.dialogo?.close();
  }

  /** Ação de diálogo: erros dentro dele; fecha no sucesso só quando pedido (logo mantém aberto). */
  private async enviar(
    requisicao: () => Observable<ClientePlataforma>,
    sucesso: (c: ClientePlataforma) => string,
    fecharNoSucesso: boolean,
  ): Promise<void> {
    this.salvando.set(true);
    this.erro.set(null);
    try {
      const cliente = await firstValueFrom(requisicao());
      this.emEdicao.set(cliente);
      if (fecharNoSucesso) {
        this.dialogo?.close();
      }
      this.avisos.open(sucesso(cliente), undefined, { duration: 6000 });
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
      this.clientes.reload();
    }
  }

  private async acao(requisicao: () => Observable<unknown>, sucesso: string): Promise<void> {
    try {
      await firstValueFrom(requisicao());
      this.avisos.open(sucesso, undefined, { duration: 5000 });
    } catch (falha) {
      this.avisos.open(mensagemDeErro(falha), 'Fechar', { duration: 8000 });
    } finally {
      this.clientes.reload();
    }
  }
}

function limitesDoFormulario(v: {
  usuarios: number | null;
  assistenteTokensPorMes: number | null;
  assistenteUsdPorMes: number | null;
}): LimitesCliente {
  return {
    usuarios: v.usuarios || null,
    assistenteTokensPorMes: v.assistenteTokensPorMes || null,
    assistenteUsdPorMes: v.assistenteUsdPorMes || null,
  };
}
