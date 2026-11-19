import { HttpClient, httpResource } from '@angular/common/http';
import { Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
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
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, filter, firstValueFrom, switchMap } from 'rxjs';
import type {
  Equipe,
  OpcoesDaEquipe,
  PedidoEquipe,
  PessoaParaEquipe,
  TipoEquipe,
  Unidade,
} from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { arvoreDeUnidades, filtrarUnidades, type OpcaoUnidade } from '../../nucleo/unidades-arvore';
import { EscolherPonto, type Ponto } from '../../ui/escolher-ponto';
import { Selo } from '../../ui/selo';

/** "07:30:00" → Date de hoje nesse horário (o timepicker trabalha com Date). */
function horario(texto: string): Date {
  const [h, m] = texto.split(':').map(Number);
  const data = new Date();
  data.setHours(h ?? 0, m ?? 0, 0, 0);
  return data;
}

function textoDoHorario(data: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(data.getHours())}:${dois(data.getMinutes())}:00`;
}

const daLista: ValidatorFn = (c) =>
  c.value && typeof c.value === 'object' ? null : { daLista: true };

/**
 * Equipes de campo (ADR 0036): própria ou terceirizada, a unidade onde atua (as OS de imóveis fora dela não seguem
 * para a equipe) e as pessoas que veem as OS em "Minhas OS" (perfil Equipe de campo).
 */
@Component({
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
    MatSelectModule,
    MatSlideToggleModule,
    MatTimepickerModule,
    EscolherPonto,
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
  protected readonly opcoes = httpResource<OpcoesDaEquipe>(() =>
    this.podeGerir() ? '/api/v1/equipes/opcoes' : undefined,
  );
  protected readonly veiculosAtivos = computed(() =>
    this.opcoes.hasValue() ? this.opcoes.value().veiculos.filter((v) => v.ativo) : [],
  );
  protected readonly habilidadesAtivas = computed(() =>
    this.opcoes.hasValue() ? this.opcoes.value().habilidades.filter((h) => h.ativo) : [],
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
    jornadaInicio: new FormControl<Date | null>(horario('07:30'), Validators.required),
    jornadaFim: new FormControl<Date | null>(horario('16:30'), Validators.required),
    pausaMin: new FormControl(60, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(240)],
    }),
    tipoVeiculoId: new FormControl<string | null>(null),
    habilidades: new FormControl<string[]>([], { nonNullable: true }),
  });
  protected readonly base = signal<Ponto | null>(null);
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

  protected jornada(e: Equipe): string {
    return `${e.operacao.jornadaInicio.slice(0, 5)}–${e.operacao.jornadaFim.slice(0, 5)}`;
  }

  protected veiculo(e: Equipe): string {
    const id = e.operacao.tipoVeiculoId;
    const v =
      id && this.opcoes.hasValue() ? this.opcoes.value().veiculos.find((x) => x.id === id) : null;
    return v?.nome ?? 'Sem veículo';
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
      jornadaInicio: horario(equipe?.operacao.jornadaInicio ?? '07:30'),
      jornadaFim: horario(equipe?.operacao.jornadaFim ?? '16:30'),
      pausaMin: equipe?.operacao.pausaMin ?? 60,
      tipoVeiculoId: equipe?.operacao.tipoVeiculoId ?? null,
      habilidades: equipe?.operacao.habilidades ?? [],
    });
    this.base.set(equipe?.operacao.base ?? null);
    this.membros.set(
      equipe?.membros.map((m) => ({ id: m.usuarioId, nome: m.nome, email: m.email })) ?? [],
    );
    this.busca.setValue('');
    this.dialogo = this.dialogos.open(this.modelo(), {
      width: '680px',
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
    if (!v.jornadaInicio || !v.jornadaFim || v.jornadaFim <= v.jornadaInicio) {
      this.erro.set('O fim da jornada deve ser depois do início.');
      return;
    }
    const base = this.base();
    const pedido: PedidoEquipe = {
      nome: v.nome.trim(),
      tipo: v.tipo,
      empresa: v.tipo === 'TERCEIRIZADA' ? v.empresa.trim() : null,
      unidadeId: (v.unidade as OpcaoUnidade).id,
      ativa: v.ativa,
      membros: this.membros().map((m) => m.id),
      operacao: {
        base: base ? { latitude: base.latitude, longitude: base.longitude } : null,
        jornadaInicio: textoDoHorario(v.jornadaInicio),
        jornadaFim: textoDoHorario(v.jornadaFim),
        pausaMin: v.pausaMin,
        tipoVeiculoId: v.tipoVeiculoId,
        habilidades: v.habilidades,
      },
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
