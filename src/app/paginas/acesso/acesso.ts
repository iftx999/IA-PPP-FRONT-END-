import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import {
  buscarCliente,
  clienteEscolhido,
  lembrarCliente,
  normalizarCodigo,
} from '../../nucleo/cliente';

/** Só caminhos internos (nada de //outro-site ou javascript:). */
export function retornoSeguro(retorno: string | null | undefined): string {
  return retorno &&
    retorno.startsWith('/') &&
    !retorno.startsWith('//') &&
    !retorno.startsWith('/acesso')
    ? retorno
    : '/';
}

/**
 * Tela de entrada com vários clientes (ADR 0027): o código da empresa leva ao login dela. Fica lembrado no navegador;
 * "Trocar de empresa" volta para cá.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'aurora-acesso',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './acesso.html',
  styleUrl: './acesso.scss',
})
export class Acesso implements OnInit {
  private readonly rota = inject(ActivatedRoute);

  protected readonly formulario = new FormGroup({
    codigo: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(40),
        Validators.pattern(/^\s*[A-Za-z0-9-]+\s*$/),
      ],
    }),
  });
  protected readonly buscando = signal(false);
  protected readonly erro = signal<string | null>(null);

  ngOnInit(): void {
    const pedido = this.rota.snapshot.queryParamMap.get('codigo');
    const ultimo = clienteEscolhido();
    this.formulario.controls.codigo.setValue(pedido ?? ultimo?.codigo ?? '');
    if (pedido) {
      this.erro.set(`Não encontramos uma empresa com o código “${pedido}”.`);
    }
  }

  protected async continuar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const codigo = normalizarCodigo(this.formulario.controls.codigo.value);
    this.buscando.set(true);
    this.erro.set(null);
    try {
      const cliente = await buscarCliente(codigo);
      if (!cliente) {
        this.erro.set(
          `Não encontramos uma empresa com o código “${codigo}”. Confira com a administração da Aurora na sua empresa.`,
        );
        return;
      }
      lembrarCliente(cliente);
      // Recarrega: a biblioteca de login parte do emissor da empresa escolhida.
      window.location.assign(retornoSeguro(this.rota.snapshot.queryParamMap.get('retorno')));
    } catch {
      this.erro.set('Não foi possível consultar o código agora. Tente novamente em instantes.');
    } finally {
      this.buscando.set(false);
    }
  }
}
