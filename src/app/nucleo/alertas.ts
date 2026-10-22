import { httpResource } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject } from '@angular/core';
import type { ResumoAlertas } from '../api/tipos';
import { competenciaLonga } from './formato';
import { SessaoService } from './sessao';

/** Resumo dos alertas para o sino, o menu e o rodapé (F3, RN-08); atualiza a cada minuto. */
@Injectable({ providedIn: 'root' })
export class AlertasService {
  private readonly sessao = inject(SessaoService);

  readonly resumo = httpResource<ResumoAlertas>(() =>
    this.sessao.pode('indicador:ler') ? '/api/v1/alertas/resumo' : undefined,
  );

  private readonly atual = computed(() => (this.resumo.hasValue() ? this.resumo.value() : undefined));
  /** Alertas que pedem ação (não reconhecidos). */
  readonly pendentes = computed(() => (this.atual()?.criticos ?? 0) + (this.atual()?.atencao ?? 0));
  readonly criticos = computed(() => this.atual()?.criticos ?? 0);
  readonly fontesAtrasadas = computed(() => this.atual()?.fontesAtrasadas ?? []);
  /** "Dados de agosto de 2026". */
  readonly dadosDe = computed(() => {
    const competencia = this.atual()?.competencia;
    return competencia ? `Dados de ${competenciaLonga(competencia).toLocaleLowerCase('pt-BR')}` : null;
  });

  constructor() {
    const intervalo = setInterval(() => {
      if (this.sessao.pode('indicador:ler') && !this.resumo.isLoading()) {
        this.resumo.reload();
      }
    }, 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(intervalo));
  }
}
