import { HttpClient, httpResource } from '@angular/common/http';
import { Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom } from 'rxjs';
import type {
  CatalogoServicos,
  GrupoServico,
  Habilidade,
  MotivoCatalogo,
  PerfilRota,
  Servico,
  TipoMotivo,
  TipoVeiculo,
} from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { filtrosNaUrl } from '../../nucleo/filtros';
import { numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { Selo } from '../../ui/selo';
import {
  ROTULO_ALVO,
  ROTULO_PERFIL_ROTA,
  ROTULO_TIPO_MOTIVO,
  filtrarServicos,
  resumoDosPrazos,
  tempoPadrao,
} from './textos';

type Aba = 'servicos' | 'motivos' | 'apoio';
const ABAS: Aba[] = ['servicos', 'motivos', 'apoio'];

/** Item de apoio em edição: grupo, veículo, habilidade ou motivo. */
type Edicao =
  | { tipo: 'grupo'; item: GrupoServico | null }
  | { tipo: 'veiculo'; item: TipoVeiculo | null }
  | { tipo: 'habilidade'; item: Habilidade | null }
  | { tipo: 'motivo'; item: MotivoCatalogo | null; tipoMotivo: TipoMotivo };

const TITULO: Record<Edicao['tipo'], string> = {
  grupo: 'grupo',
  veiculo: 'tipo de veículo',
  habilidade: 'habilidade',
  motivo: 'motivo',
};

/**
 * Catálogo de serviços de campo (ADR 0042, J1–J2): serviços por grupo, motivos de paralisação,
 * devolução, não execução e cancelamento, e os itens de apoio (grupos, veículos, habilidades).
 */
@Component({
  selector: 'aurora-catalogo',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTabsModule,
    Selo,
  ],
  templateUrl: './catalogo.html',
  styleUrls: ['../campanhas/campanhas.scss', './catalogo.scss'],
})
export class Catalogo {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  protected readonly sessao = inject(SessaoService);

  protected readonly podeGerir = computed(() => this.sessao.pode('servico:gerenciar'));
  protected readonly dados = httpResource<CatalogoServicos>(() =>
    this.podeGerir() ? '/api/v1/catalogo' : undefined,
  );
  protected readonly catalogo = computed(() =>
    this.dados.hasValue() ? this.dados.value() : undefined,
  );

  protected readonly fmt = { numero, tempoPadrao, resumoDosPrazos };
  protected readonly rotuloAlvo = ROTULO_ALVO;
  protected readonly rotuloPerfil = ROTULO_PERFIL_ROTA;
  protected readonly perfis = Object.entries(ROTULO_PERFIL_ROTA).map(([valor, rotulo]) => ({
    valor: valor as PerfilRota,
    rotulo,
  }));
  protected readonly tiposMotivo = Object.entries(ROTULO_TIPO_MOTIVO).map(([valor, t]) => ({
    valor: valor as TipoMotivo,
    ...t,
  }));

  // ----- Abas e filtros (na URL) -----
  protected readonly filtros = filtrosNaUrl(['aba', 'busca', 'grupo', 'inativos']);
  protected readonly aba = computed<Aba>(() => {
    const valor = this.filtros.valor('aba') as Aba | null;
    return valor && ABAS.includes(valor) ? valor : 'servicos';
  });
  protected readonly indiceAba = computed(() => ABAS.indexOf(this.aba()));
  protected readonly busca = new FormControl(this.filtros.inicial('busca'), { nonNullable: true });
  protected readonly filtroGrupo = computed(() => this.filtros.valor('grupo'));
  protected readonly comInativos = computed(() => this.filtros.valor('inativos') === 'sim');
  protected readonly filtrando = computed(
    () => !!this.filtros.valor('busca') || !!this.filtroGrupo() || this.comInativos(),
  );

  protected readonly visiveis = computed(() =>
    filtrarServicos(this.catalogo()?.servicos ?? [], {
      termo: this.filtros.valor('busca') ?? '',
      grupo: this.filtroGrupo(),
      inativos: this.comInativos(),
    }),
  );
  /** Serviços visíveis agrupados, na ordem dos grupos. */
  protected readonly porGrupo = computed(() => {
    const c = this.catalogo();
    if (!c) {
      return [];
    }
    const servicos = this.visiveis();
    return c.grupos
      .map((g) => ({ grupo: g, servicos: servicos.filter((s) => s.grupoId === g.id) }))
      .filter((g) => g.servicos.length > 0);
  });
  protected readonly motivosPorTipo = computed(() => {
    const motivos = this.catalogo()?.motivos ?? [];
    return this.tiposMotivo.map((t) => ({
      ...t,
      motivos: motivos.filter((m) => m.tipo === t.valor),
    }));
  });

  constructor() {
    this.busca.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed())
      .subscribe((v) => this.filtros.aplicar({ busca: v.trim() }));
  }

  protected trocarAba(indice: number): void {
    this.filtros.aplicar({ aba: indice === 0 ? null : ABAS[indice] });
  }

  protected limparFiltros(): void {
    this.busca.setValue('', { emitEvent: false });
    this.filtros.aplicar({ busca: null, grupo: null, inativos: null });
  }

  protected nomeDe(
    lista: readonly { id: string; nome: string }[] | undefined,
    id: string | null | undefined,
  ): string | null {
    return id ? (lista?.find((i) => i.id === id)?.nome ?? null) : null;
  }

  protected nomeDoServico(id: string | null | undefined): string | null {
    return id ? (this.catalogo()?.servicos.find((s) => s.id === id)?.definicao.nome ?? null) : null;
  }

  protected exigencias(s: Servico): string {
    const c = this.catalogo();
    return [
      this.nomeDe(c?.veiculos, s.definicao.tipoVeiculoId),
      this.nomeDe(c?.habilidades, s.definicao.habilidadeId),
    ]
      .filter((x) => !!x)
      .join(' · ');
  }

  // ----- Diálogo dos itens de apoio e motivos -----
  private readonly modelo = viewChild.required<TemplateRef<unknown>>('modeloItem');
  private dialogo?: MatDialogRef<unknown>;
  protected readonly edicao = signal<Edicao | null>(null);
  protected readonly tituloEdicao = computed(() => {
    const e = this.edicao();
    return e ? `${e.item ? 'Editar' : 'Novo'} ${TITULO[e.tipo]}` : '';
  });
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly form = new FormGroup({
    nome: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    }),
    codigo: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(40)] }),
    ativo: new FormControl(true, { nonNullable: true }),
    perfilRota: new FormControl<PerfilRota>('CARRO', { nonNullable: true }),
    exigeObservacao: new FormControl(false, { nonNullable: true }),
    servicoId: new FormControl<string | null>(null),
  });

  protected abrir(edicao: Edicao): void {
    this.erro.set(null);
    this.edicao.set(edicao);
    const item = edicao.item;
    this.form.reset({
      nome: item?.nome ?? '',
      codigo: item?.codigo ?? '',
      ativo: item?.ativo ?? true,
      perfilRota: edicao.tipo === 'veiculo' ? (edicao.item?.perfilRota ?? 'CARRO') : 'CARRO',
      exigeObservacao: edicao.tipo === 'motivo' ? (edicao.item?.exigeObservacao ?? false) : false,
      servicoId: edicao.tipo === 'motivo' ? (edicao.item?.servicoId ?? null) : null,
    });
    this.dialogo = this.dialogos.open(this.modelo(), {
      width: '520px',
      maxWidth: '96vw',
      autoFocus: 'first-tabbable',
    });
  }

  protected fechar(): void {
    this.dialogo?.close();
  }

  protected async salvar(): Promise<void> {
    const e = this.edicao();
    if (!e || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const base = { nome: v.nome.trim(), codigo: v.codigo.trim() || null, ativo: v.ativo };
    const [caminho, corpo] =
      e.tipo === 'grupo'
        ? ['grupos', base]
        : e.tipo === 'habilidade'
          ? ['habilidades', base]
          : e.tipo === 'veiculo'
            ? ['veiculos', { ...base, perfilRota: v.perfilRota }]
            : [
                'motivos',
                {
                  ...base,
                  tipo: e.tipoMotivo,
                  exigeObservacao: v.exigeObservacao,
                  servicoId: v.servicoId,
                },
              ];
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await firstValueFrom(
        e.item
          ? this.http.put(`/api/v1/catalogo/${caminho}/${e.item.id}`, corpo)
          : this.http.post(`/api/v1/catalogo/${caminho}`, corpo),
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
