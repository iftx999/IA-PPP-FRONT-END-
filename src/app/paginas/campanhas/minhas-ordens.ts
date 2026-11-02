import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer, type SafeUrl } from '@angular/platform-browser';
import type { OrdemServico } from '../../api/tipos';
import { data, dataEHora } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { Selo } from '../../ui/selo';
import { ResultadoOrdemDialogo, type DadosResultado } from './resultado-ordem';
import {
  ROTULO_CONFERENCIA,
  ROTULO_MOTIVO,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS,
  ROTULO_TIPO,
  linkDoPonto,
} from './textos';

/**
 * OS das equipes de que a pessoa faz parte (I3): em campo primeiro (prioridade e prazo), depois os resultados dos
 * últimos 30 dias. Feita para o celular: cartões, botão grande de resultado e o ponto no aplicativo de mapas.
 */
@Component({
  selector: 'aurora-minhas-ordens',
  imports: [MatButtonModule, Selo],
  templateUrl: './minhas-ordens.html',
  styleUrl: './minhas-ordens.scss',
})
export class MinhasOrdens {
  private readonly dialogos = inject(MatDialog);
  private readonly avisos = inject(MatSnackBar);
  private readonly sanitizador = inject(DomSanitizer);
  protected readonly sessao = inject(SessaoService);

  protected readonly podeExecutar = computed(() => this.sessao.pode('os:executar'));
  protected readonly dados = httpResource<OrdemServico[]>(() =>
    this.podeExecutar() ? '/api/v1/minhas-ordens' : undefined,
  );
  protected readonly emCampo = computed(() =>
    this.dados.hasValue()
      ? this.dados.value().filter((o) => o.status === 'EM_CAMPO' || o.status === 'REAGENDADA')
      : [],
  );
  protected readonly concluidas = computed(() =>
    this.dados.hasValue()
      ? this.dados.value().filter((o) => o.status !== 'EM_CAMPO' && o.status !== 'REAGENDADA')
      : [],
  );
  protected readonly atrasadas = computed(() => this.emCampo().filter((o) => o.atrasada).length);

  protected readonly fmt = { data, dataEHora };
  protected readonly rotulos = {
    tipo: ROTULO_TIPO,
    status: ROTULO_STATUS,
    prioridade: ROTULO_PRIORIDADE,
    conferencia: ROTULO_CONFERENCIA,
    motivo: ROTULO_MOTIVO,
  };

  /** URI geo: (o Angular bloqueia esquemas desconhecidos; o texto vem só de dois números). */
  protected ponto(o: OrdemServico): SafeUrl | null {
    const link = linkDoPonto(o);
    return link ? this.sanitizador.bypassSecurityTrustUrl(link) : null;
  }

  protected registrar(ordem: OrdemServico): void {
    const dados: DadosResultado = { ordem, base: '/api/v1/minhas-ordens' };
    this.dialogos
      .open(ResultadoOrdemDialogo, { data: dados, width: '560px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((atualizada?: OrdemServico) => {
        if (atualizada) {
          this.avisos.open(
            `OS ${atualizada.numero}: ${ROTULO_STATUS[atualizada.status].texto.toLowerCase()}.`,
            'Ok',
            {
              duration: 4000,
            },
          );
          this.dados.reload();
        }
      });
  }
}
