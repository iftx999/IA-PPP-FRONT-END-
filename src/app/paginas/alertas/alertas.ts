import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { AlertaApi, PreferenciaEmail, PreferenciasAlertas, Unidade } from '../../api/tipos';
import { AlertasService } from '../../nucleo/alertas';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { filtrosNaUrl } from '../../nucleo/filtros';
import { dataEHora, haQuantoTempo, numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';
import { FiltroUnidade } from '../../ui/filtro-unidade';

type Estado = 'ABERTOS' | 'RECONHECIDOS' | 'RESOLVIDOS';
type TipoAlerta = AlertaApi['tipo'];

export const ROTULOS_TIPO_ALERTA: Record<TipoAlerta, string> = {
  INDICADOR_ABAIXO_DA_META: 'Abaixo da meta',
  META_FORA_DO_RITMO: 'Fora do ritmo',
  FONTE_ATRASADA: 'Fonte atrasada',
  PRAZO_CONTRATUAL: 'Prazo contratual',
  TRILHA_ALTERADA: 'Trilha alterada',
  ORDEM_DIVERGENTE: 'Ordem divergente',
};

export const ICONES_ALERTA: Record<AlertaApi['tipo'], string> = {
  INDICADOR_ABAIXO_DA_META: 'trending_down',
  META_FORA_DO_RITMO: 'speed',
  FONTE_ATRASADA: 'cloud_off',
  PRAZO_CONTRATUAL: 'event_busy',
  TRILHA_ALTERADA: 'gpp_bad',
  ORDEM_DIVERGENTE: 'sync_problem',
};

export const MENSAGENS_PREFERENCIA: Record<PreferenciaEmail, string> = {
  NENHUM: 'Você não vai receber alertas por e-mail.',
  CRITICOS: 'Você vai receber por e-mail os alertas críticos novos.',
  TODOS: 'Você vai receber por e-mail todos os alertas novos.',
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
  imports: [
    RouterLink, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatSelectModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatTooltipModule, FiltroUnidade,
  ],
  templateUrl: './alertas.html',
  styleUrl: './alertas.scss',
})
export class Alertas {
  private readonly http = inject(HttpClient);
  private readonly avisos = inject(MatSnackBar);
  protected readonly sessao = inject(SessaoService);
  protected readonly resumo = inject(AlertasService);

  /** Situação, tipos, severidade e unidade ficam na URL; a API filtra (a lista tem limite). */
  protected readonly filtros = filtrosNaUrl(['estado', 'tipo', 'severidade', 'unidade']);
  protected readonly estado = computed(() => (this.filtros.valor('estado') as Estado | null) ?? 'ABERTOS');
  protected readonly tipos = computed(() => (this.filtros.valor('tipo')?.split(',') ?? []) as TipoAlerta[]);
  protected readonly severidade = computed(() => this.filtros.valor('severidade') as AlertaApi['severidade'] | null);
  protected readonly unidade = computed(() => this.filtros.valor('unidade'));
  /** Filtros além da situação (que tem as abas próprias). */
  protected readonly filtrando = computed(() => this.tipos().length > 0 || !!this.severidade() || !!this.unidade());
  protected readonly opcoesTipo = Object.entries(ROTULOS_TIPO_ALERTA).map(([valor, rotulo]) => ({
    valor: valor as TipoAlerta,
    rotulo,
  }));
  protected readonly dados = httpResource<AlertaApi[]>(() => {
    if (!this.sessao.pode('indicador:ler')) {
      return undefined;
    }
    const params: Record<string, string | string[]> = { estado: this.estado() };
    if (this.tipos().length) {
      params['tipo'] = this.tipos();
    }
    if (this.severidade()) {
      params['severidade'] = this.severidade()!;
    }
    if (this.unidade()) {
      params['unidade'] = this.unidade()!;
    }
    return { url: '/api/v1/alertas', params };
  });
  protected readonly unidades = httpResource<Unidade[]>(() =>
    this.sessao.pode('unidade:ler') ? '/api/v1/unidades' : undefined,
  );
  protected readonly alertas = computed(() => (this.dados.hasValue() ? this.dados.value() : undefined));
  /** ADR 0024: cada pessoa escolhe quais alertas novos recebe por e-mail. */
  protected readonly preferencias = httpResource<PreferenciasAlertas>(() =>
    this.sessao.usuario() ? '/api/v1/alertas/preferencias' : undefined,
  );
  protected readonly salvandoPreferencia = signal(false);
  protected readonly reconhecendo = signal<string | null>(null);
  protected readonly avaliando = signal(false);

  protected readonly fmt = { dataEHora, haQuantoTempo, numero };
  protected readonly icone = (a: Pick<AlertaApi, 'tipo'>) => ICONES_ALERTA[a.tipo];
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

  protected async definirPreferencia(email: PreferenciaEmail): Promise<void> {
    this.salvandoPreferencia.set(true);
    try {
      const salvas = await firstValueFrom(this.http.put<PreferenciasAlertas>('/api/v1/alertas/preferencias', { email }));
      this.preferencias.set(salvas);
      this.avisos.open(MENSAGENS_PREFERENCIA[email], undefined, { duration: 4000 });
    } catch (falha) {
      this.avisos.open(mensagemDeErro(falha), 'Fechar', { duration: 8000 });
      this.preferencias.reload();
    } finally {
      this.salvandoPreferencia.set(false);
    }
  }

  protected escolherEstado(estado: Estado): void {
    this.filtros.aplicar({ estado: estado === 'ABERTOS' ? null : estado });
  }

  protected limparFiltros(): void {
    this.filtros.aplicar({ tipo: null, severidade: null, unidade: null });
  }

  private recarregar(): void {
    this.dados.reload();
    this.resumo.resumo.reload();
  }
}
