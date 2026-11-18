import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer, type SafeUrl } from '@angular/platform-browser';
import type { MotivoDaOrdem, OrdemServico } from '../../api/tipos';
import { data, dataEHora } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { Selo } from '../../ui/selo';
import { JustificativaOrdemDialogo, type DadosJustificativa } from './justificativa-ordem';
import { ResultadoOrdemDialogo, type DadosResultado } from './resultado-ordem';
import {
  ROTULO_CONFERENCIA,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS,
  alvoDaOrdem,
  comEquipe,
  linkDoPonto,
  podeEncerrar,
  quantidadeComUnidade,
} from './textos';

/**
 * OS das equipes de que a pessoa faz parte (ADR 0036, 0044): as com a equipe primeiro (data, prioridade e prazo),
 * depois as encerradas e devolvidas dos últimos 30 dias. Feita para o celular: cartões, botões grandes de encerrar e
 * devolver e o ponto no aplicativo de mapas. Iniciar e paralisar chegam com o app (M4).
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
  private readonly motivos = httpResource<MotivoDaOrdem[]>(() =>
    this.podeExecutar() ? '/api/v1/minhas-ordens/motivos' : undefined,
  );
  protected readonly emCampo = computed(() =>
    this.dados.hasValue() ? this.dados.value().filter((o) => comEquipe(o.status)) : [],
  );
  protected readonly concluidas = computed(() =>
    this.dados.hasValue() ? this.dados.value().filter((o) => !comEquipe(o.status)) : [],
  );
  protected readonly atrasadas = computed(() => this.emCampo().filter((o) => o.atrasada).length);

  protected readonly fmt = { data, dataEHora, quantidade: quantidadeComUnidade };
  protected readonly rotulos = {
    status: ROTULO_STATUS,
    prioridade: ROTULO_PRIORIDADE,
    conferencia: ROTULO_CONFERENCIA,
  };
  protected readonly alvo = alvoDaOrdem;
  protected readonly podeEncerrar = podeEncerrar;

  /** URI geo: (o Angular bloqueia esquemas desconhecidos; o texto vem só de dois números). */
  protected ponto(o: OrdemServico): SafeUrl | null {
    const link = linkDoPonto(o);
    return link ? this.sanitizador.bypassSecurityTrustUrl(link) : null;
  }

  protected encerrar(ordem: OrdemServico): void {
    const dados: DadosResultado = {
      ordem,
      base: '/api/v1/minhas-ordens',
      motivos: this.motivos.value() ?? [],
    };
    this.depois(
      this.dialogos.open(ResultadoOrdemDialogo, { data: dados, width: '560px', maxWidth: '96vw' }),
    );
  }

  protected devolver(ordem: OrdemServico): void {
    const dados: DadosJustificativa = {
      ordem,
      acao: 'DEVOLUCAO',
      url: `/api/v1/minhas-ordens/${ordem.id}/devolver`,
      motivos: this.motivos.value() ?? [],
    };
    this.depois(
      this.dialogos.open(JustificativaOrdemDialogo, {
        data: dados,
        width: '520px',
        maxWidth: '96vw',
      }),
    );
  }

  private depois(dialogo: MatDialogRef<unknown, OrdemServico>): void {
    dialogo.afterClosed().subscribe((atualizada) => {
      if (atualizada) {
        this.avisos.open(
          `OS ${atualizada.numero}: ${ROTULO_STATUS[atualizada.status].texto.toLowerCase()}.`,
          'Ok',
          { duration: 4000 },
        );
        this.dados.reload();
      }
    });
  }
}
