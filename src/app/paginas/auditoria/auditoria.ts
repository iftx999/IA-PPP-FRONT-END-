import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import type { AutorAuditoria, EventoAuditoria, PaginaAuditoria, Unidade, VerificacaoAuditoria } from '../../api/tipos';
import { paraIso } from '../../nucleo/datas';
import { DownloadService } from '../../nucleo/download';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { dataEHora, haQuantoTempo, numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { arvoreDeUnidades, filtrarUnidades, type OpcaoUnidade } from '../../nucleo/unidades-arvore';
import { Selo } from '../../ui/selo';
import { gruposDeEventos, infoEvento, paresDeDetalhes } from './eventos';

const LIMITE = '50';

/** Filtros aplicados (os campos editam um rascunho; "Aplicar" copia para cá). */
interface Filtros {
  usuario: string | null;
  tipos: string[];
  de: string | null;
  ate: string | null;
  unidade: OpcaoUnidade | null;
}

const SEM_FILTROS: Filtros = { usuario: null, tipos: [], de: null, ate: null, unidade: null };

/** Parâmetros da API para os filtros (tipos repetem o parâmetro). */
export function parametros(f: Filtros): Record<string, string | string[]> {
  const p: Record<string, string | string[]> = {};
  if (f.usuario) {
    p['usuario'] = f.usuario;
  }
  if (f.tipos.length) {
    p['tipo'] = f.tipos;
  }
  if (f.de) {
    p['de'] = f.de;
  }
  if (f.ate) {
    p['ate'] = f.ate;
  }
  if (f.unidade) {
    p['unidade'] = f.unidade.id;
  }
  return p;
}

/** Trilha de auditoria (S8): quem fez o quê, quando e onde; exportação e verificação da cadeia. */
@Component({
  selector: 'aurora-auditoria',
  imports: [
    ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatAutocompleteModule,
    MatDatepickerModule, MatTooltipModule, MatProgressSpinnerModule, Selo,
  ],
  templateUrl: './auditoria.html',
  styleUrl: './auditoria.scss',
})
export class Auditoria {
  private readonly http = inject(HttpClient);
  private readonly downloads = inject(DownloadService);
  protected readonly sessao = inject(SessaoService);

  private readonly podeVer = computed(() => this.sessao.pode('auditoria:ler'));
  protected readonly podeExportar = computed(() => this.sessao.pode('relatorio:exportar'));

  protected readonly filtros = signal<Filtros>(SEM_FILTROS);
  protected readonly dados = httpResource<PaginaAuditoria>(() =>
    this.podeVer() ? { url: '/api/v1/auditoria/eventos', params: { ...parametros(this.filtros()), limite: LIMITE } } : undefined,
  );
  private readonly dadosTipos = httpResource<string[]>(() => (this.podeVer() ? '/api/v1/auditoria/tipos' : undefined));
  private readonly dadosAutores = httpResource<AutorAuditoria[]>(() => (this.podeVer() ? '/api/v1/auditoria/autores' : undefined));
  private readonly dadosUnidades = httpResource<Unidade[]>(() => (this.podeVer() ? '/api/v1/unidades' : undefined));

  /** Eventos já carregados (primeira página + "carregar mais"). */
  protected readonly eventos = linkedSignal<EventoAuditoria[] | undefined>(() =>
    this.dados.hasValue() ? this.dados.value().eventos : undefined,
  );
  protected readonly proximo = linkedSignal<string | null>(() => (this.dados.hasValue() ? this.dados.value().proximo : null));
  protected readonly carregandoMais = signal(false);

  /** 403 da API: tem a permissão, mas não na unidade raiz. */
  protected readonly semEscopo = computed(() => (this.dados.error() as { status?: number } | undefined)?.status === 403);

  protected readonly grupos = computed(() => (this.dadosTipos.hasValue() ? gruposDeEventos(this.dadosTipos.value()) : []));
  protected readonly autores = computed(() => (this.dadosAutores.hasValue() ? this.dadosAutores.value() : []));
  private readonly unidades = computed(() => (this.dadosUnidades.hasValue() ? arvoreDeUnidades(this.dadosUnidades.value()) : []));

  // ----- Campos dos filtros -----
  protected readonly campoUsuario = new FormControl<string | null>(null);
  protected readonly campoTipos = new FormControl<string[]>([], { nonNullable: true });
  protected readonly campoDe = new FormControl<Date | null>(null);
  protected readonly campoAte = new FormControl<Date | null>(null);
  protected readonly campoUnidade = new FormControl<OpcaoUnidade | string | null>(null);
  /** Agrupa os campos para o (ngSubmit) do formulário (sem [formGroup] o submit seria o nativo). */
  protected readonly formFiltros = new FormGroup({
    usuario: this.campoUsuario, tipos: this.campoTipos, de: this.campoDe, ate: this.campoAte, unidade: this.campoUnidade,
  });
  private readonly textoUnidade = toSignal(this.campoUnidade.valueChanges, { initialValue: null });
  protected readonly opcoesUnidade = computed(() => {
    const texto = this.textoUnidade();
    return typeof texto === 'string' ? filtrarUnidades(this.unidades(), texto) : this.unidades();
  });
  protected readonly exibirUnidade = (o: OpcaoUnidade | string | null) => (o && typeof o === 'object' ? o.caminho : (o ?? ''));

  protected readonly temFiltros = computed(() => {
    const f = this.filtros();
    return !!(f.usuario || f.tipos.length || f.de || f.ate || f.unidade);
  });

  // ----- Linhas expandidas, exportação e verificação -----
  protected readonly abertos = signal(new Set<number>());
  protected readonly exportando = signal(false);
  protected readonly erroExportacao = signal<string | null>(null);
  protected readonly verificando = signal(false);
  protected readonly verificacao = signal<VerificacaoAuditoria | null>(null);
  protected readonly erroVerificacao = signal<string | null>(null);

  protected readonly fmt = { numero, dataEHora, haQuantoTempo };
  protected readonly info = infoEvento;
  protected readonly pares = paresDeDetalhes;

  protected aplicar(): void {
    const unidade = this.campoUnidade.value;
    this.filtros.set({
      usuario: this.campoUsuario.value,
      tipos: this.campoTipos.value,
      de: paraIso(this.campoDe.value),
      ate: paraIso(this.campoAte.value),
      unidade: unidade && typeof unidade === 'object' ? unidade : null,
    });
    this.abertos.set(new Set());
  }

  protected limpar(): void {
    this.campoUsuario.reset(null);
    this.campoTipos.reset([]);
    this.campoDe.reset(null);
    this.campoAte.reset(null);
    this.campoUnidade.reset(null);
    this.aplicar();
  }

  protected alternar(sequencia: number): void {
    this.abertos.update((atual) => {
      const novo = new Set(atual);
      if (novo.has(sequencia)) {
        novo.delete(sequencia);
      } else {
        novo.add(sequencia);
      }
      return novo;
    });
  }

  protected async carregarMais(): Promise<void> {
    const cursor = this.proximo();
    if (!cursor || this.carregandoMais()) {
      return;
    }
    this.carregandoMais.set(true);
    try {
      const pagina = await firstValueFrom(
        this.http.get<PaginaAuditoria>('/api/v1/auditoria/eventos', {
          params: { ...parametros(this.filtros()), limite: LIMITE, cursor },
        }),
      );
      this.eventos.update((atuais) => [...(atuais ?? []), ...pagina.eventos]);
      this.proximo.set(pagina.proximo);
    } finally {
      this.carregandoMais.set(false);
    }
  }

  protected async exportar(): Promise<void> {
    this.exportando.set(true);
    this.erroExportacao.set(null);
    try {
      const p = parametros(this.filtros());
      // HttpParams aceita listas; o serviço de download recebe pares simples, então os tipos vão separados.
      const simples = Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
      const tipos = this.filtros().tipos.map((t) => `tipo=${encodeURIComponent(t)}`).join('&');
      await this.downloads.baixar(`/api/v1/auditoria/eventos/exportacao.csv${tipos ? `?${tipos}` : ''}`, simples, 'auditoria.csv');
      // A exportação também entra na trilha.
      this.dados.reload();
    } catch (falha) {
      this.erroExportacao.set(mensagemDeErro(falha, 'Não foi possível exportar. Tente novamente.'));
    } finally {
      this.exportando.set(false);
    }
  }

  protected async verificar(): Promise<void> {
    this.verificando.set(true);
    this.erroVerificacao.set(null);
    try {
      this.verificacao.set(await firstValueFrom(this.http.get<VerificacaoAuditoria>('/api/v1/auditoria/verificacao')));
    } catch (falha) {
      this.erroVerificacao.set(mensagemDeErro(falha));
    } finally {
      this.verificando.set(false);
    }
  }

  protected quem(e: EventoAuditoria): string {
    return e.usuarioNome ?? (e.usuarioId ? 'Usuário removido' : 'Sistema');
  }
}
