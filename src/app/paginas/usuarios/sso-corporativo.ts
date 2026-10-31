import { Clipboard } from '@angular/cdk/clipboard';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom, type Observable } from 'rxjs';
import type { PedidoSso, SsoCorporativo as Sso } from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { Selo } from '../../ui/selo';

export type Protocolo = PedidoSso['protocolo'];

/** Endereços que o administrador registra no IdP, conforme o protocolo. */
export function enderecosParaRegistrar(sso: Sso, protocolo: Protocolo): { rotulo: string; valor: string }[] {
  return protocolo === 'OIDC'
    ? [{ rotulo: 'Endereço de retorno (redirect URI)', valor: sso.enderecoRetorno }]
    : [
        { rotulo: 'Identificador (Entity ID)', valor: sso.entidadeSaml },
        { rotulo: 'Endereço de resposta (ACS)', valor: sso.enderecoRetorno },
        { rotulo: 'Metadados da Aurora', valor: sso.metadadosSaml },
      ];
}

/** Monta o pedido; segredo vazio mantém o atual no servidor e não vai para SAML. */
export function pedidoSso(v: {
  protocolo: Protocolo; nome: string; endereco: string; clienteId: string; segredo: string;
  habilitado: boolean; confiaSegundoFator: boolean;
}): PedidoSso {
  const oidc = v.protocolo === 'OIDC';
  return {
    protocolo: v.protocolo,
    nome: v.nome.trim(),
    endereco: v.endereco.trim(),
    clienteId: oidc ? v.clienteId.trim() : null,
    segredo: oidc && v.segredo ? v.segredo : null,
    habilitado: v.habilitado,
    confiaSegundoFator: v.confiaSegundoFator,
  };
}

/**
 * SSO corporativo do tenant (S10, ADR 0025): liga o diretório da empresa (Entra ID, ADFS, Google, Okta…) ao login.
 * Só quem já foi convidado entra por ele; perfis e unidades continuam definidos na Aurora.
 */
@Component({
  selector: 'aurora-sso-corporativo',
  imports: [
    ReactiveFormsModule, MatButtonModule, MatButtonToggleModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatProgressSpinnerModule, MatSlideToggleModule, MatSnackBarModule, MatTooltipModule, Selo,
  ],
  templateUrl: './sso-corporativo.html',
  styleUrl: './sso-corporativo.scss',
})
export class SsoCorporativo {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly avisos = inject(MatSnackBar);
  private readonly areaDeTransferencia = inject(Clipboard);

  protected readonly sso = httpResource<Sso>(() => '/api/v1/seguranca/sso');
  protected readonly provedor = computed(() => (this.sso.hasValue() ? this.sso.value().provedor : null));

  private readonly modelo = viewChild.required<TemplateRef<unknown>>('modeloSso');
  private dialogo?: MatDialogRef<unknown>;
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly confirmandoRemocao = signal(false);

  protected readonly formulario = new FormGroup({
    protocolo: new FormControl<Protocolo>('OIDC', { nonNullable: true }),
    nome: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
    endereco: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(2048), Validators.pattern(/^https?:\/\/\S+$/i)],
    }),
    clienteId: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    segredo: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1024)] }),
    habilitado: new FormControl(true, { nonNullable: true }),
    confiaSegundoFator: new FormControl(false, { nonNullable: true }),
  });
  protected readonly protocolo = toSignal(this.formulario.controls.protocolo.valueChanges, { initialValue: 'OIDC' as Protocolo });
  /** Segredo já gravado no provedor: o campo pode ficar vazio. */
  protected readonly temSegredo = signal(false);
  protected readonly enderecos = computed(() =>
    this.sso.hasValue() ? enderecosParaRegistrar(this.sso.value(), this.protocolo()) : [],
  );

  protected abrir(): void {
    const p = this.provedor();
    this.erro.set(null);
    this.confirmandoRemocao.set(false);
    this.temSegredo.set(p?.protocolo === 'OIDC');
    this.formulario.reset({
      protocolo: p?.protocolo ?? 'OIDC',
      nome: p?.nome ?? '',
      endereco: p?.endereco ?? '',
      clienteId: p?.clienteId ?? '',
      segredo: '',
      habilitado: p?.habilitado ?? true,
      confiaSegundoFator: this.sso.hasValue() ? this.sso.value().confiaSegundoFator : false,
    });
    this.dialogo = this.dialogos.open(this.modelo(), { width: '680px', autoFocus: 'first-tabbable' });
  }

  protected copiar(valor: string): void {
    this.areaDeTransferencia.copy(valor);
    this.avisos.open('Copiado.', undefined, { duration: 2000 });
  }

  /** Campos de OIDC só são obrigatórios em OIDC; o segredo, só se ainda não há um gravado. */
  private faltandoOidc(): boolean {
    if (this.protocolo() !== 'OIDC') {
      return false;
    }
    const { clienteId, segredo } = this.formulario.controls;
    clienteId.setErrors(clienteId.value.trim() ? clienteId.errors : { ...clienteId.errors, required: true });
    if (!this.temSegredo() && !segredo.value) {
      segredo.setErrors({ ...segredo.errors, required: true });
    }
    return clienteId.invalid || segredo.invalid;
  }

  protected async salvar(): Promise<void> {
    const faltando = this.faltandoOidc();
    if (this.formulario.invalid || faltando) {
      this.formulario.markAllAsTouched();
      return;
    }
    const pedido = pedidoSso(this.formulario.getRawValue());
    await this.enviar(
      () => this.http.put<Sso>('/api/v1/seguranca/sso', pedido),
      pedido.habilitado ? `Login com ${pedido.nome} ativado.` : 'SSO corporativo salvo (desabilitado).',
    );
  }

  protected async remover(): Promise<void> {
    await this.enviar(() => this.http.delete<Sso>('/api/v1/seguranca/sso'), 'SSO corporativo removido.');
  }

  protected fechar(): void {
    this.dialogo?.close();
  }

  private async enviar(requisicao: () => Observable<Sso>, sucesso: string): Promise<void> {
    this.salvando.set(true);
    this.erro.set(null);
    try {
      this.sso.set(await firstValueFrom(requisicao()));
      this.dialogo?.close();
      this.avisos.open(sucesso, undefined, { duration: 5000 });
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
