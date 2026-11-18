import { HttpClient, httpResource } from '@angular/common/http';
import { Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import type { Dispositivo } from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { dataEHora, numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { Selo } from '../../ui/selo';
import { situacaoDoDispositivo, type FiltroDispositivos, filtrarDispositivos } from './textos';

/**
 * Celulares do app de campo (J13; ADR 0045): quem usa, modelo, versão do app e último
 * contato. Bloquear um celular perdido corta o acesso e apaga os dados dele na próxima
 * conexão (a fila pendente ainda é enviada).
 */
@Component({
  selector: 'aurora-dispositivos',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    Selo,
  ],
  templateUrl: './dispositivos.html',
  styleUrls: [
    '../campanhas/campanhas.scss',
    '../logradouros/logradouros.scss',
    './dispositivos.scss',
  ],
})
export class Dispositivos {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  private readonly avisos = inject(MatSnackBar);
  protected readonly sessao = inject(SessaoService);

  protected readonly podeGerir = computed(() => this.sessao.pode('dispositivo:gerenciar'));
  protected readonly fmt = { dataEHora, numero };
  protected readonly situacao = situacaoDoDispositivo;
  protected readonly filtro = signal<FiltroDispositivos>('EM_USO');
  protected readonly dados = httpResource<Dispositivo[]>(() =>
    this.podeGerir() ? '/api/v1/dispositivos' : undefined,
  );
  protected readonly lista = computed(() =>
    filtrarDispositivos(this.dados.hasValue() ? this.dados.value() : [], this.filtro()),
  );

  private readonly modeloBloqueio = viewChild.required<TemplateRef<unknown>>('modeloBloqueio');
  private dialogo?: MatDialogRef<unknown>;
  protected readonly escolhido = signal<Dispositivo | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected bloquear(d: Dispositivo): void {
    this.escolhido.set(d);
    this.erro.set(null);
    this.dialogo = this.dialogos.open(this.modeloBloqueio(), { width: '480px', maxWidth: '96vw' });
  }

  protected fechar(): void {
    this.dialogo?.close();
  }

  protected async confirmarBloqueio(): Promise<void> {
    const d = this.escolhido();
    if (!d) {
      return;
    }
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await firstValueFrom(this.http.post<Dispositivo>(`/api/v1/dispositivos/${d.id}/revogar`, {}));
      this.dialogo?.close();
      this.avisos.open(`Celular de ${d.usuarioNome} bloqueado.`, 'Ok', { duration: 5000 });
      this.dados.reload();
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
