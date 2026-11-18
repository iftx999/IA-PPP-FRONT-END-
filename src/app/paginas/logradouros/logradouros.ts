import { HttpClient, httpResource } from '@angular/common/http';
import { Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom } from 'rxjs';
import type {
  CoberturaEnderecos,
  ImportacaoLogradouro,
  PaginaLogradouros,
  ResultadoImportacaoLogradouro,
  Unidade,
} from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { filtrosNaUrl } from '../../nucleo/filtros';
import { dataEHora, numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { arvoreDeUnidades } from '../../nucleo/unidades-arvore';
import {
  MODELO_ENDERECOS,
  MODELO_TRECHOS,
  extensao,
  indicadoresDaCobertura,
  nomeCompleto,
} from './textos';

type TipoImportacao = 'TRECHOS' | 'ENDERECOS';

/**
 * Logradouros e trechos da concessionária (ADR 0043, J3): cobertura do cadastro por município,
 * importação com simulação (o relatório vem antes de gravar), lista com busca e o histórico.
 */
@Component({
  selector: 'aurora-logradouros',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './logradouros.html',
  styleUrls: ['../campanhas/campanhas.scss', './logradouros.scss'],
})
export class Logradouros {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  protected readonly sessao = inject(SessaoService);

  protected readonly podeGerir = computed(() => this.sessao.pode('logradouro:gerenciar'));
  protected readonly fmt = { numero, dataEHora, extensao, nomeCompleto };

  // ----- Filtros (na URL) -----
  protected readonly filtros = filtrosNaUrl(['unidade', 'busca', 'pagina']);
  protected readonly busca = new FormControl(this.filtros.inicial('busca'), { nonNullable: true });
  protected readonly unidade = computed(() => this.filtros.valor('unidade'));
  protected readonly pagina = computed(() => Number(this.filtros.valor('pagina') ?? 0) || 0);

  private readonly dadosUnidades = httpResource<Unidade[]>(() =>
    this.podeGerir() && this.sessao.pode('unidade:ler') ? '/api/v1/unidades' : undefined,
  );
  protected readonly municipios = computed(() =>
    this.dadosUnidades.hasValue()
      ? arvoreDeUnidades(this.dadosUnidades.value()).filter((u) => u.tipo === 'MUNICIPIO')
      : [],
  );
  protected readonly nomeDoMunicipio = computed(
    () => this.municipios().find((m) => m.id === this.unidade())?.nome,
  );

  protected readonly lista = httpResource<PaginaLogradouros>(() =>
    this.podeGerir()
      ? {
          url: '/api/v1/logradouros',
          params: {
            ...(this.unidade() ? { unidade: this.unidade()! } : {}),
            busca: this.filtros.valor('busca') ?? '',
            pagina: this.pagina(),
          },
        }
      : undefined,
  );
  protected readonly paginas = computed(() =>
    this.lista.hasValue()
      ? Math.max(1, Math.ceil(this.lista.value().total / this.lista.value().tamanho))
      : 1,
  );
  protected readonly cobertura = httpResource<CoberturaEnderecos>(() =>
    this.podeGerir() && this.unidade()
      ? { url: '/api/v1/logradouros/cobertura', params: { unidade: this.unidade()! } }
      : undefined,
  );
  protected readonly indicadores = computed(() =>
    this.cobertura.hasValue() ? indicadoresDaCobertura(this.cobertura.value()) : [],
  );
  protected readonly historico = httpResource<ImportacaoLogradouro[]>(() =>
    this.podeGerir() ? '/api/v1/logradouros/importacoes' : undefined,
  );

  constructor() {
    this.busca.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed())
      .subscribe((v) => this.filtros.aplicar({ busca: v.trim(), pagina: null }));
  }

  protected escolherMunicipio(id: string): void {
    this.filtros.aplicar({ unidade: id, pagina: null });
  }

  protected irParaPagina(pagina: number): void {
    this.filtros.aplicar({ pagina: pagina > 0 ? String(pagina) : null });
  }

  // ----- Importação -----
  private readonly modelo = viewChild.required<TemplateRef<unknown>>('modeloImportacao');
  private dialogo?: MatDialogRef<unknown>;
  protected readonly tipo = signal<TipoImportacao>('TRECHOS');
  protected readonly arquivo = signal<File | null>(null);
  protected readonly municipioDaImportacao = new FormControl<string | null>(null);
  protected readonly resultado = signal<ResultadoImportacaoLogradouro | null>(null);
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);
  /** Só importa de verdade depois de simular o mesmo arquivo. */
  protected readonly simulado = computed(() => this.resultado()?.simulacao === true);

  protected abrirImportacao(tipo: TipoImportacao): void {
    this.tipo.set(tipo);
    this.arquivo.set(null);
    this.resultado.set(null);
    this.erro.set(null);
    this.municipioDaImportacao.setValue(this.unidade());
    this.dialogo = this.dialogos.open(this.modelo(), {
      width: '720px',
      maxWidth: '96vw',
      autoFocus: 'first-tabbable',
    });
  }

  protected fechar(): void {
    this.dialogo?.close();
  }

  protected escolherArquivo(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    this.arquivo.set(campo.files?.[0] ?? null);
    campo.value = '';
    this.resultado.set(null);
    this.erro.set(null);
  }

  protected baixarModelo(): void {
    const trechos = this.tipo() === 'TRECHOS';
    const conteudo = trechos ? MODELO_TRECHOS : '﻿' + MODELO_ENDERECOS;
    const url = URL.createObjectURL(
      new Blob([conteudo], { type: trechos ? 'application/geo+json' : 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = trechos ? 'modelo-trechos.geojson' : 'modelo-enderecos.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  protected async enviar(simular: boolean): Promise<void> {
    const arquivo = this.arquivo();
    const trechos = this.tipo() === 'TRECHOS';
    const municipio = this.municipioDaImportacao.value;
    if (!arquivo || (trechos && !municipio)) {
      this.erro.set(
        trechos && !municipio ? 'Escolha o município dos trechos.' : 'Escolha o arquivo.',
      );
      return;
    }
    const corpo = new FormData();
    corpo.append('arquivo', arquivo, arquivo.name);
    this.enviando.set(true);
    this.erro.set(null);
    try {
      const r = await firstValueFrom(
        this.http.post<ResultadoImportacaoLogradouro>(
          `/api/v1/logradouros/importacoes/${trechos ? 'trechos' : 'enderecos'}`,
          corpo,
          { params: { simular, ...(trechos ? { unidade: municipio! } : {}) } },
        ),
      );
      this.resultado.set(r);
      if (!simular) {
        this.arquivo.set(null);
        this.lista.reload();
        this.cobertura.reload();
        this.historico.reload();
      }
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.enviando.set(false);
    }
  }
}
