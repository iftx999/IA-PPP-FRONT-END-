import { HttpClient, httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import type { ConflitoDeCampo, OrdemServico, PaginaConflitos } from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { dataEHora, numero } from '../../nucleo/formato';
import { Selo } from '../../ui/selo';
import { ROTULO_STATUS } from '../campanhas/textos';
import { ExecucaoOrdemDialogo, type DadosExecucao } from './execucao-ordem';
import { ROTULO_ACAO, ROTULO_CONFLITO } from './textos';

/**
 * Caixa de conflitos de campo (J11; 10.9.5; ADR 0045): o que o campo fez quando a
 * programação já tinha mudado. O programador reprograma, cancela ou aceita na tela de OS
 * e registra aqui a decisão (fica na trilha).
 */
@Component({
  selector: 'aurora-conflitos',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    Selo,
  ],
  templateUrl: './conflitos.html',
  styleUrl: './conflitos.scss',
})
export class ConflitosDialogo {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);

  protected readonly fmt = { dataEHora, numero };
  protected readonly rotulos = {
    acao: ROTULO_ACAO,
    conflito: ROTULO_CONFLITO,
    status: ROTULO_STATUS,
  };
  protected readonly abertos = signal(true);
  protected readonly pagina = httpResource<PaginaConflitos>(() => ({
    url: '/api/v1/ordens/conflitos',
    params: { abertos: this.abertos() },
  }));

  protected readonly decidindo = signal<string | null>(null);
  protected readonly decisao = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3), Validators.maxLength(500)],
  });
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  /** Houve decisão: a tela de OS atualiza o contador ao fechar. */
  protected alterou = false;

  protected decidir(c: ConflitoDeCampo): void {
    this.decidindo.set(c.id);
    this.decisao.reset('');
    this.erro.set(null);
  }

  protected desistir(): void {
    this.decidindo.set(null);
  }

  protected async registrar(c: ConflitoDeCampo): Promise<void> {
    if (this.decisao.invalid) {
      this.decisao.markAsTouched();
      return;
    }
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await firstValueFrom(
        this.http.post<ConflitoDeCampo>(`/api/v1/ordens/conflitos/${c.id}/decisao`, {
          decisao: this.decisao.value.trim(),
        }),
      );
      this.alterou = true;
      this.decidindo.set(null);
      this.pagina.reload();
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async verOrdem(c: ConflitoDeCampo): Promise<void> {
    const ordem = await firstValueFrom(this.http.get<OrdemServico>(`/api/v1/ordens/${c.osId}`));
    this.dialogos.open<ExecucaoOrdemDialogo, DadosExecucao>(ExecucaoOrdemDialogo, {
      data: { ordem },
      width: '44rem',
      maxWidth: 'calc(100vw - 2rem)',
      autoFocus: 'dialog',
    });
  }
}
