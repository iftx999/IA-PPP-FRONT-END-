import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AlertasService } from '../nucleo/alertas';
import { CONFIGURACAO } from '../nucleo/configuracao';
import { SessaoService } from '../nucleo/sessao';
import { secoesPermitidas } from '../nucleo/telas';
import { TemaService } from '../nucleo/tema';


/** Estrutura da aplicação: barra lateral fixa + cabeçalho + conteúdo (docs/07, seções 7.4 e 7.5). */
@Component({
  selector: 'aurora-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatMenuModule, MatTooltipModule],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  host: { '(document:keydown.control.j)': 'abrirAssistente($event)' },
})
export class Shell {
  protected readonly tema = inject(TemaService);
  protected readonly sessao = inject(SessaoService);
  /** ADR 0027: instalação com vários clientes (tela do código da empresa). */
  protected readonly variosClientes = inject(CONFIGURACAO).escolherCliente === true;
  protected readonly alertas = inject(AlertasService);
  private readonly roteador = inject(Router);
  private readonly avisos = inject(MatSnackBar);

  protected async sairDeTodosOsDispositivos(): Promise<void> {
    if (!(await this.sessao.sairDeTodosOsDispositivos())) {
      this.avisos.open('Não foi possível encerrar as sessões agora. Tente de novo em instantes.', 'Fechar', {
        duration: 8000,
      });
    }
  }

  /** Ctrl+J abre o assistente (doc 05, 5.9). */
  protected abrirAssistente(evento?: Event): void {
    evento?.preventDefault();
    void this.roteador.navigate(['/assistente']);
  }

  /** Doc 08, 8.4: só as telas que o perfil permite abrir. */
  protected readonly secoes = computed(() => secoesPermitidas(this.sessao.usuario()?.permissoes ?? []));
}
