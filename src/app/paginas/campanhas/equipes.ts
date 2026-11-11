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
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type ValidatorFn,
} from '@angular/forms';
import {
  MatAutocompleteModule,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, filter, firstValueFrom, switchMap } from 'rxjs';
import type { Equipe, PedidoEquipe, PessoaParaEquipe, TipoEquipe, Unidade } from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { arvoreDeUnidades, filtrarUnidades, type OpcaoUnidade } from '../../nucleo/unidades-arvore';
import { Selo } from '../../ui/selo';

const daLista: ValidatorFn = (c) =>
  c.value && typeof c.value === 'object' ? null : { daLista: true };

/**
 * Equipes de campo (ADR 0036): própria ou terceirizada, a unidade onde atua (as OS de imóveis fora dela não seguem
 * para a equipe) e as pessoas que veem as OS em "Minhas OS" (perfil Equipe de campo).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'aurora-equipes',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    Selo,
  ],
  templateUrl: './equipes.html',
  styleUrl: './campanhas.scss',
})
export class Equipes {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  protected readonly sessao = inject(SessaoService);

  protected readonly podeGerir = computed(() => this.sessao.pode('campanha:gerenciar'));
  protected readonly dados = httpResource<Equipe[]>(() =>
    this.podeGerir() ? '/api/v1/equipes' : undefined,
  );
  private readonly dadosUnidades = httpResource<Unidade[]>(() =>
    this.podeGerir() && this.sessao.pode('unidade:ler') ? '/api/v1/unidades' : undefined,
  );
  protected readonly fmt = { numero };

  private readonly modelo = viewChild.required<TemplateRef<unknown>>('modeloEquipe');
  private dialogo?: MatDialogRef<unknown>;
  protected readonly editando = signal<Equipe | null>(null);
  protected readonly membros = signal<PessoaParaEquipe[]>([]);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly form = new FormGroup({
    nome: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    }),
    tipo: new FormControl<TipoEquipe>('PROPRIA', { nonNullable: true }),
    empresa: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
    unidade: new FormControl<OpcaoUnidade | string | null>(null, [Validators.required, daLista]),
    ativa: new FormControl(true, { nonNullable: true }),
  });
  protected readonly busca = new FormControl('', { nonNullable: true });
  protected readonly pessoas = toSignal(
    this.busca.valueChanges.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      filter((t) => typeof t === 'string'),
      switchMap((t) =>
        t.trim().length < 2
          ? Promise.resolve([] as PessoaParaEquipe[])
          : firstValueFrom(
              this.http.get<PessoaParaEquipe[]>('/api/v1/equipes/pessoas', {
                params: { busca: t.trim() },
              }),
            ).catch(() => [] as PessoaParaEquipe[]),
      ),
    ),
    { initialValue: [] as PessoaParaEquipe[] },
  );

  private readonly textoUnidade = toSignal(this.form.controls.unidade.valueChanges, {
    initialValue: null,
  });
  protected readonly opcoesUnidade = computed(() => {
    const unidades = this.dadosUnidades.hasValue()
      ? arvoreDeUnidades(this.dadosUnidades.value())
      : [];
    const texto = this.textoUnidade();
    return (typeof texto === 'string' ? filtrarUnidades(unidades, texto) : unidades).filter(
      (o) => !['ETE', 'EEE'].includes(o.tipo),
    );
  });
  protected readonly exibirUnidade = (o: OpcaoUnidade | string | null) =>
    o && typeof o === 'object' ? o.caminho : (o ?? '');
  private readonly tipo = toSignal(this.form.controls.tipo.valueChanges, {
    initialValue: 'PROPRIA' as TipoEquipe,
  });
  protected readonly terceirizada = computed(() => this.tipo() === 'TERCEIRIZADA');

  protected nomes(e: Equipe): string {
    return e.membros.map((m) => m.nome).join(', ');
  }

  protected abrir(equipe: Equipe | null): void {
    this.erro.set(null);
    this.editando.set(equipe);
    const unidade =
      equipe && this.dadosUnidades.hasValue()
        ? (arvoreDeUnidades(this.dadosUnidades.value()).find((o) => o.id === equipe.unidadeId) ??
          null)
        : null;
    this.form.reset({
      nome: equipe?.nome ?? '',
      tipo: equipe?.tipo ?? 'PROPRIA',
      empresa: equipe?.empresa ?? '',
      unidade,
      ativa: equipe?.ativa ?? true,
    });
    this.membros.set(
      equipe?.membros.map((m) => ({ id: m.usuarioId, nome: m.nome, email: m.email })) ?? [],
    );
    this.busca.setValue('');
    this.dialogo = this.dialogos.open(this.modelo(), {
      width: '620px',
      maxWidth: '96vw',
      autoFocus: 'first-tabbable',
    });
  }

  protected fechar(): void {
    this.dialogo?.close();
  }

  protected adicionar(evento: MatAutocompleteSelectedEvent): void {
    const pessoa = evento.option.value as PessoaParaEquipe;
    if (!this.membros().some((m) => m.id === pessoa.id)) {
      this.membros.update((lista) => [...lista, pessoa]);
    }
    this.busca.setValue('');
  }

  protected remover(id: string): void {
    this.membros.update((lista) => lista.filter((m) => m.id !== id));
  }

  protected async salvar(): Promise<void> {
    const v = this.form.getRawValue();
    if (this.form.invalid || (v.tipo === 'TERCEIRIZADA' && v.empresa.trim().length < 2)) {
      this.form.markAllAsTouched();
      if (v.tipo === 'TERCEIRIZADA' && v.empresa.trim().length < 2) {
        this.erro.set('Informe a empresa da equipe terceirizada.');
      }
      return;
    }
    const pedido: PedidoEquipe = {
      nome: v.nome.trim(),
      tipo: v.tipo,
      empresa: v.tipo === 'TERCEIRIZADA' ? v.empresa.trim() : null,
      unidadeId: (v.unidade as OpcaoUnidade).id,
      ativa: v.ativa,
      membros: this.membros().map((m) => m.id),
    };
    const atual = this.editando();
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await firstValueFrom(
        atual
          ? this.http.put<Equipe>(`/api/v1/equipes/${atual.id}`, pedido)
          : this.http.post<Equipe>('/api/v1/equipes', pedido),
      );
      this.dialogo?.close();
      this.dados.reload();
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
