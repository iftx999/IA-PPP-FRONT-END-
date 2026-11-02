import { Component, computed, effect, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule, type MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { arvoreDeUnidades, filtrarUnidades, type NoUnidade, type OpcaoUnidade } from '../nucleo/unidades-arvore';

/**
 * Filtro por unidade para barras de filtro: busca na árvore (nome ou caminho) e devolve o id
 * escolhido, ou null em "Todas". Quem usa decide se a unidade inclui as de baixo.
 */
@Component({
  selector: 'aurora-filtro-unidade',
  imports: [ReactiveFormsModule, MatAutocompleteModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field subscriptSizing="dynamic" class="campo">
      <mat-label>{{ rotulo() }}</mat-label>
      <input matInput [formControl]="campo" [matAutocomplete]="lista" placeholder="Todas" (blur)="aoSair()" />
      @if (valor()) {
        <button matIconButton matSuffix type="button" (click)="escolher(null)" [attr.aria-label]="'Limpar ' + rotulo()">
          <span class="material-symbols-rounded" aria-hidden="true">close</span>
        </button>
      }
      <mat-autocomplete #lista="matAutocomplete" [displayWith]="exibir" (optionSelected)="selecionada($event)">
        @for (o of opcoes(); track o.id) {
          <mat-option [value]="o" [style.padding-left.px]="16 + o.profundidade * 16">{{ o.nome }}</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: `
    :host { display: block; width: 240px; }
    .campo { width: 100%; }
  `,
})
export class FiltroUnidade {
  readonly unidades = input.required<readonly NoUnidade[]>();
  /** Id da unidade escolhida (vem da URL). */
  readonly valor = input<string | null>(null);
  readonly rotulo = input('Unidade');
  readonly escolha = output<string | null>();

  protected readonly campo = new FormControl<OpcaoUnidade | string | null>(null);
  private readonly arvore = computed(() => arvoreDeUnidades([...this.unidades()]));
  private readonly texto = toSignal(this.campo.valueChanges, { initialValue: null });
  protected readonly opcoes = computed(() => {
    const t = this.texto();
    return typeof t === 'string' ? filtrarUnidades(this.arvore(), t) : this.arvore();
  });
  protected readonly exibir = (o: OpcaoUnidade | string | null) => (o && typeof o === 'object' ? o.caminho : (o ?? ''));

  constructor() {
    // A URL manda: escolha vinda de fora (link, voltar, limpar) aparece no campo.
    effect(() => {
      const id = this.valor();
      const atual = this.campo.value;
      if (!id) {
        if (atual && typeof atual === 'object') {
          this.campo.setValue(null);
        }
        return;
      }
      if (!atual || typeof atual !== 'object' || atual.id !== id) {
        const opcao = this.arvore().find((o) => o.id === id);
        if (opcao) {
          this.campo.setValue(opcao);
        }
      }
    });
  }

  protected selecionada(e: MatAutocompleteSelectedEvent): void {
    this.escolha.emit((e.option.value as OpcaoUnidade).id);
  }

  protected escolher(id: string | null): void {
    this.campo.setValue(null);
    this.escolha.emit(id);
  }

  /** Texto apagado volta para "Todas"; texto solto (sem escolher da lista) volta para a escolha atual. */
  protected aoSair(): void {
    const v = this.campo.value;
    if (typeof v !== 'string') {
      return;
    }
    if (!v.trim()) {
      if (this.valor()) {
        this.escolha.emit(null);
      }
      return;
    }
    // Espera o clique numa opção ser processado antes de desfazer o texto solto.
    setTimeout(() => {
      if (typeof this.campo.value === 'string') {
        this.campo.setValue(this.arvore().find((o) => o.id === this.valor()) ?? null);
      }
    }, 200);
  }
}
