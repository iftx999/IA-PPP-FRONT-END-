import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { FormulaPenalidade, ItemContratual, PedidoRegraDePenalidade, RegraDePenalidade } from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { dataEHora } from '../../nucleo/formato';
import { descreverRegra } from '../simulador/textos';

type Contagem = PedidoRegraDePenalidade['contagem'];
type Periodicidade = PedidoRegraDePenalidade['periodicidade'];

/**
 * Sugestão inicial do formulário a partir do item aprovado: "%" no valor indica a fórmula percentual; "anual" na
 * periodicidade, aferição a cada 12 meses. A pessoa confere tudo antes de salvar.
 */
export function sugestaoDaRegra(item: Pick<ItemContratual, 'valorReferencia' | 'unidadeMedida' | 'periodicidade' | 'trecho'>): {
  formula: FormulaPenalidade;
  valor: number | null;
  contagem: Contagem;
  periodicidade: Periodicidade;
} {
  const percentualNoItem = (item.unidadeMedida ?? '').includes('%');
  const anual = /anual/i.test(item.periodicidade ?? '');
  const fracao = /ou fra[cç][aã]o/i.test(item.trecho);
  return {
    formula: percentualNoItem ? 'PERCENTUAL_DA_BASE_POR_PONTO' : 'VALOR_POR_PONTO',
    valor: item.valorReferencia ?? null,
    contagem: fracao ? 'POR_PONTO_OU_FRACAO' : 'PROPORCIONAL',
    periodicidade: anual ? 'ANUAL' : 'MENSAL',
  };
}

/** Penalidade calculável (ADR 0035): a regra que o simulador usa para estimar a multa desta penalidade aprovada. */
@Component({
  selector: 'aurora-regra-penalidade',
  imports: [
    ReactiveFormsModule, RouterLink, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule,
    MatSelectModule,
  ],
  template: `
    <section class="regra" aria-labelledby="titulo-regra">
      <h3 id="titulo-regra"><span class="material-symbols-rounded" aria-hidden="true">calculate</span> Cálculo da multa</h3>
      @if (editando()) {
        <form [formGroup]="form" (ngSubmit)="salvar()" class="formulario">
          <mat-button-toggle-group formControlName="formula" aria-label="Fórmula" class="formulas">
            <mat-button-toggle value="PERCENTUAL_DA_BASE_POR_PONTO">% de uma base por ponto</mat-button-toggle>
            <mat-button-toggle value="VALOR_POR_PONTO">R$ por ponto</mat-button-toggle>
            <mat-button-toggle value="VALOR_FIXO">R$ fixo</mat-button-toggle>
          </mat-button-toggle-group>
          <div class="linha">
            <mat-form-field>
              <mat-label>{{ percentual() ? 'Percentual por ponto' : 'Valor' }}</mat-label>
              <input matInput type="number" min="0" step="any" formControlName="valor" />
              <span matTextSuffix>{{ percentual() ? '%' : 'R$' }}</span>
              <mat-error>Informe um valor maior que zero.</mat-error>
            </mat-form-field>
            @if (percentual()) {
              <mat-form-field>
                <mat-label>Base</mat-label>
                <input matInput type="number" min="0" step="any" formControlName="baseValor" />
                <span matTextSuffix>R$</span>
                <mat-hint>Não vem do contrato: informe o valor atual.</mat-hint>
                <mat-error>Informe a base em reais.</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>O que é a base</mat-label>
                <input matInput maxlength="120" formControlName="baseDescricao" placeholder="Faturamento mensal" />
              </mat-form-field>
            }
          </div>
          <div class="linha">
            @if (form.controls.formula.value !== 'VALOR_FIXO') {
              <mat-form-field>
                <mat-label>Pontos abaixo da meta</mat-label>
                <mat-select formControlName="contagem">
                  <mat-option value="POR_PONTO_OU_FRACAO">Por ponto ou fração (2,4 conta 3)</mat-option>
                  <mat-option value="PROPORCIONAL">Proporcional (2,4 conta 2,4)</mat-option>
                </mat-select>
              </mat-form-field>
            }
            <mat-form-field>
              <mat-label>Aferição</mat-label>
              <mat-select formControlName="periodicidade">
                <mat-option value="MENSAL">Todo mês a partir do prazo</mat-option>
                <mat-option value="ANUAL">A cada 12 meses a partir do prazo</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Teto por aferição (opcional)</mat-label>
              <input matInput type="number" min="0" step="any" formControlName="teto" />
              <span matTextSuffix>R$</span>
            </mat-form-field>
          </div>
          @if (erro()) {
            <p class="erro" role="alert"><span class="material-symbols-rounded" aria-hidden="true">error</span>{{ erro() }}</p>
          }
          <div class="acoes">
            <button matButton type="button" (click)="editando.set(false)">Cancelar</button>
            <button matButton="filled" type="submit" [disabled]="salvando()">Salvar cálculo</button>
          </div>
        </form>
      } @else if (regra(); as r) {
        <p class="descricao">{{ descrever(r) }}</p>
        <p class="nota">
          Aferida em {{ r.unidadeNome }} · atualizada {{ r.atualizadoPor ? 'por ' + r.atualizadoPor + ', ' : '' }}{{ quando(r.atualizadoEm) }}
        </p>
        <div class="acoes">
          <a matButton="outlined" routerLink="/simulador" [queryParams]="{ unidade: r.unidadeId }" (click)="dialogos.closeAll()">
            <span class="material-symbols-rounded" aria-hidden="true">insights</span> Simular
          </a>
          @if (podeGerir()) {
            <button matButton type="button" (click)="editar(r)">Editar</button>
            @if (confirmandoRemocao()) {
              <button matButton="tonal" type="button" class="perigo" [disabled]="salvando()" (click)="remover()">Confirmar remoção</button>
              <button matButton type="button" (click)="confirmandoRemocao.set(false)">Manter</button>
            } @else {
              <button matButton type="button" (click)="confirmandoRemocao.set(true)">Remover</button>
            }
          }
        </div>
      } @else if (regras.isLoading()) {
        <p class="nota">Carregando…</p>
      } @else {
        <p class="nota">
          Sem regra de cálculo: o simulador não estima esta multa.
          @if (!podeGerir()) { Quem gerencia contratos pode defini-la. }
        </p>
        @if (podeGerir()) {
          <div class="acoes">
            <button matButton="outlined" type="button" (click)="editar(null)">
              <span class="material-symbols-rounded" aria-hidden="true">add</span> Definir cálculo
            </button>
          </div>
        }
      }
    </section>
  `,
  styles: `
    .regra { display: grid; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--line); }
    h3 { display: flex; align-items: center; gap: 6px; margin: 0; font: 600 var(--fs-body) var(--font-ui); }
    h3 .material-symbols-rounded { font-size: 20px; color: var(--text-3); }
    .descricao { margin: 0; }
    .nota { margin: 0; color: var(--text-3); font-size: var(--fs-small); }
    .formulario { display: grid; gap: var(--space-3); }
    .formulas { justify-self: start; }
    .linha { display: flex; flex-wrap: wrap; gap: var(--space-3); }
    .linha mat-form-field { flex: 1 1 200px; }
    .acoes { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: flex-end; }
    .perigo { color: var(--danger); }
    .erro { display: flex; gap: 6px; align-items: center; margin: 0; color: var(--danger); font-size: var(--fs-small); }
  `,
})
export class RegraPenalidade {
  readonly item = input.required<ItemContratual>();
  readonly podeGerir = input(false);

  private readonly http = inject(HttpClient);
  private readonly avisos = inject(MatSnackBar);
  /** O componente vive dentro do diálogo do item: ao ir para o simulador, o diálogo fecha. */
  protected readonly dialogos = inject(MatDialog);

  protected readonly regras = httpResource<RegraDePenalidade[]>(() => `/api/v1/contratos/${this.item().contratoId}/regras-de-penalidade`);
  protected readonly regra = computed(() =>
    this.regras.hasValue() ? (this.regras.value().find((r) => r.itemId === this.item().id) ?? null) : null,
  );

  protected readonly editando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly confirmandoRemocao = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly form = new FormGroup({
    formula: new FormControl<FormulaPenalidade>('PERCENTUAL_DA_BASE_POR_PONTO', { nonNullable: true }),
    valor: new FormControl<number | null>(null, [Validators.required, Validators.min(0.000001)]),
    baseValor: new FormControl<number | null>(null),
    baseDescricao: new FormControl<string>('', { nonNullable: true }),
    contagem: new FormControl<Contagem>('POR_PONTO_OU_FRACAO', { nonNullable: true }),
    periodicidade: new FormControl<Periodicidade>('MENSAL', { nonNullable: true }),
    teto: new FormControl<number | null>(null, [Validators.min(0.01)]),
  });

  private readonly formula = signal<FormulaPenalidade>('PERCENTUAL_DA_BASE_POR_PONTO');
  protected readonly percentual = computed(() => this.formula() === 'PERCENTUAL_DA_BASE_POR_PONTO');

  constructor() {
    this.form.controls.formula.valueChanges.subscribe((f) => {
      this.formula.set(f);
      const base = this.form.controls.baseValor;
      base.setValidators(f === 'PERCENTUAL_DA_BASE_POR_PONTO' ? [Validators.required, Validators.min(0.01)] : []);
      base.updateValueAndValidity();
    });
  }

  protected descrever(r: RegraDePenalidade): string {
    return descreverRegra(r);
  }

  protected quando(iso: string): string {
    return dataEHora(iso);
  }

  protected editar(r: RegraDePenalidade | null): void {
    const sugestao = sugestaoDaRegra(this.item());
    this.form.reset({
      formula: r?.formula ?? sugestao.formula,
      valor: r?.valor ?? sugestao.valor,
      baseValor: r?.baseValor ?? null,
      baseDescricao: r?.baseDescricao ?? (sugestao.formula === 'PERCENTUAL_DA_BASE_POR_PONTO' ? 'Faturamento mensal' : ''),
      contagem: r?.contagem ?? sugestao.contagem,
      periodicidade: r?.periodicidade ?? sugestao.periodicidade,
      teto: r?.teto ?? null,
    });
    this.form.controls.formula.updateValueAndValidity({ emitEvent: true });
    this.formula.set(this.form.controls.formula.value);
    this.erro.set(null);
    this.editando.set(true);
  }

  protected async salvar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const percentual = v.formula === 'PERCENTUAL_DA_BASE_POR_PONTO';
    const pedido: PedidoRegraDePenalidade = {
      formula: v.formula,
      valor: v.valor!,
      baseValor: percentual ? v.baseValor : null,
      baseDescricao: percentual && v.baseDescricao.trim() ? v.baseDescricao.trim() : null,
      contagem: v.contagem,
      periodicidade: v.periodicidade,
      teto: v.teto || null,
    };
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await firstValueFrom(this.http.put(`/api/v1/contratos/itens/${this.item().id}/regra-de-penalidade`, pedido));
      this.editando.set(false);
      this.regras.reload();
      this.avisos.open('Cálculo da multa salvo. O simulador já considera esta penalidade.', 'Fechar', { duration: 5000 });
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha, 'Não foi possível salvar o cálculo.'));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async remover(): Promise<void> {
    this.salvando.set(true);
    try {
      await firstValueFrom(this.http.delete(`/api/v1/contratos/itens/${this.item().id}/regra-de-penalidade`));
      this.confirmandoRemocao.set(false);
      this.regras.reload();
      this.avisos.open('Cálculo removido: o simulador não estima mais esta multa.', 'Fechar', { duration: 5000 });
    } catch (falha) {
      this.avisos.open(mensagemDeErro(falha, 'Não foi possível remover o cálculo.'), 'Fechar', { duration: 6000 });
    } finally {
      this.salvando.set(false);
    }
  }
}
