import { HttpClient, httpResource } from '@angular/common/http';
import { Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, type ValidatorFn } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Contrato, PedidoContrato, Unidade } from '../../api/tipos';
import { paraIso } from '../../nucleo/datas';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { data, numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { arvoreDeUnidades, filtrarUnidades, semAcento, type OpcaoUnidade } from '../../nucleo/unidades-arvore';

const daLista: ValidatorFn = (c) => (c.value && typeof c.value === 'object' ? null : { escolha: true });

/** Contratos de concessão/PPP (épico A): lista e cadastro. */
@Component({
  selector: 'aurora-contratos',
  imports: [
    ReactiveFormsModule, RouterLink, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatAutocompleteModule, MatDatepickerModule, MatProgressSpinnerModule,
  ],
  templateUrl: './contratos.html',
  styleUrl: './contratos.scss',
})
export class Contratos {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly router = inject(Router);
  protected readonly sessao = inject(SessaoService);

  private readonly podeVer = computed(() => this.sessao.pode('contrato:ler'));
  protected readonly podeGerir = computed(() => this.sessao.pode('contrato:gerenciar'));
  protected readonly dados = httpResource<Contrato[]>(() => (this.podeVer() ? '/api/v1/contratos' : undefined));
  private readonly dadosUnidades = httpResource<Unidade[]>(() => (this.podeGerir() ? '/api/v1/unidades' : undefined));

  protected readonly busca = new FormControl('', { nonNullable: true });
  private readonly termo = toSignal(this.busca.valueChanges, { initialValue: '' });
  protected readonly contratos = computed(() => {
    if (!this.dados.hasValue()) {
      return undefined;
    }
    const t = semAcento(this.termo().trim());
    return this.dados
      .value()
      .filter((c) => !t || semAcento(`${c.numero} ${c.unidadeNome} ${c.objeto ?? ''}`).includes(t));
  });
  protected readonly pendentes = computed(() => (this.dados.hasValue() ? this.dados.value().reduce((s, c) => s + c.itensPendentes, 0) : 0));

  protected readonly fmt = { data, numero };

  // ----- Novo contrato -----
  private readonly modeloNovo = viewChild.required<TemplateRef<unknown>>('modeloNovo');
  private dialogoAberto?: MatDialogRef<unknown>;
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly formulario = new FormGroup({
    numero: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
    unidade: new FormControl<OpcaoUnidade | string | null>(null, [Validators.required, daLista]),
    objeto: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    poderConcedente: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
    regulador: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
    dataAssinatura: new FormControl<Date | null>(null),
    vigenciaFim: new FormControl<Date | null>(null),
  });
  private readonly textoUnidade = toSignal(this.formulario.controls.unidade.valueChanges, { initialValue: null });
  protected readonly opcoesUnidade = computed(() => {
    const unidades = this.dadosUnidades.hasValue() ? arvoreDeUnidades(this.dadosUnidades.value()) : [];
    const texto = this.textoUnidade();
    return (typeof texto === 'string' ? filtrarUnidades(unidades, texto) : unidades).filter((o) =>
      ['GRUPO', 'CONCESSAO', 'MUNICIPIO'].includes(o.tipo),
    );
  });
  protected readonly exibirUnidade = (o: OpcaoUnidade | string | null) => (o && typeof o === 'object' ? o.caminho : (o ?? ''));

  protected abrirNovo(): void {
    this.erro.set(null);
    this.formulario.reset();
    this.dialogoAberto = this.dialogos.open(this.modeloNovo(), { width: '640px', autoFocus: 'first-tabbable' });
  }

  protected fechar(): void {
    this.dialogoAberto?.close();
  }

  protected async criar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const v = this.formulario.getRawValue();
    const pedido: PedidoContrato = {
      numero: v.numero.trim(),
      unidadeId: (v.unidade as OpcaoUnidade).id,
      objeto: v.objeto.trim() || null,
      poderConcedente: v.poderConcedente.trim() || null,
      regulador: v.regulador.trim() || null,
      dataAssinatura: paraIso(v.dataAssinatura),
      vigenciaFim: paraIso(v.vigenciaFim),
    };
    this.salvando.set(true);
    this.erro.set(null);
    try {
      const criado = await firstValueFrom(this.http.post<{ id: string }>('/api/v1/contratos', pedido));
      this.dialogoAberto?.close();
      await this.router.navigate(['/contratos', criado.id]);
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
