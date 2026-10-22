import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { AlertaApi } from '../../api/tipos';
import { AlertasService } from '../../nucleo/alertas';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { dataEHora, haQuantoTempo, numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';

type Estado = 'ABERTOS' | 'RECONHECIDOS' | 'RESOLVIDOS';

export const ICONES_ALERTA: Record<AlertaApi['tipo'], string> = {
  INDICADOR_ABAIXO_DA_META: 'trending_down',
  META_FORA_DO_RITMO: 'speed',
  FONTE_ATRASADA: 'cloud_off',
  PRAZO_CONTRATUAL: 'event_busy',
  TRILHA_ALTERADA: 'gpp_bad',
};

/** "/painel?unidade=x" → rota e parâmetros para o routerLink. */
export function destino(link: string | null): { rota: string; params: Record<string, string> } | null {
  if (!link) {
    return null;
  }
  const [rota, consulta] = link.split('?');
  return { rota: rota!, params: Object.fromEntries(new URLSearchParams(consulta ?? '')) };
}

/** Alertas (épico F): lista por situação, ver a tela relacionada, reconhecer. */
@Component({
  selector: 'aurora-alertas',
  imports: [RouterLink, MatButtonModule, MatButtonToggleModule, MatProgressSpinnerModule, MatSnackBarModule, MatTooltipModule],
  templateUrl: './alertas.html',
  styleUrl: './alertas.scss',
})
export class Alertas {
  private readonly http = inject(HttpClient);
  private readonly avisos = inject(MatSnackBar);
  protected readonly sessao = inject(SessaoService);
  protected readonly resumo = inject(AlertasService);

  protected readonly estado = signal<Estado>('ABERTOS');
  protected readonly dados = httpResource<AlertaApi[]>(() =>
    this.sessao.pode('indicador:ler') ? { url: '/api/v1/alertas', params: { estado: this.estado() } } : undefined,
  );
  protected readonly alertas = computed(() => (this.dados.hasValue() ? this.dados.value() : undefined));
  protected readonly reconhecendo = signal<string | null>(null);
  protected readonly avaliando = signal(false);

  protected readonly fmt = { dataEHora, haQuantoTempo, numero };
  protected readonly icone = (a: AlertaApi) => ICONES_ALERTA[a.tipo];
  protected readonly destino = destino;

  protected async reconhecer(a: AlertaApi): Promise<void> {
    this.reconhecendo.set(a.id);
    try {
      await firstValueFrom(this.http.post(`/api/v1/alertas/${a.id}/reconhecimento`, null));
      this.avisos.open('Alerta reconhecido. Ele se resolve sozinho quando a condição passar.', undefined, { duration: 4000 });
      this.recarregar();
    } catch (falha) {
      this.avisos.open(mensagemDeErro(falha), 'Fechar', { duration: 8000 });
    } finally {
      this.reconhecendo.set(null);
    }
  }

  protected async avaliarAgora(): Promise<void> {
    this.avaliando.set(true);
    try {
      const r = await firstValueFrom(
        this.http.post<{ abertos: number; atualizados: number; resolvidos: number }>('/api/v1/alertas/avaliacao', null),
      );
      this.avisos.open(`Avaliação concluída: ${r.abertos} novos, ${r.resolvidos} resolvidos.`, undefined, { duration: 4000 });
      this.recarregar();
    } catch (falha) {
      this.avisos.open(mensagemDeErro(falha), 'Fechar', { duration: 8000 });
    } finally {
      this.avaliando.set(false);
    }
  }

  private recarregar(): void {
    this.dados.reload();
    this.resumo.resumo.reload();
  }
}
