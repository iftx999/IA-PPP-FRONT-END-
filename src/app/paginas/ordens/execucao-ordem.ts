import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import type { ExecucaoDaOrdem, OrdemServico } from '../../api/tipos';
import { dataEHora, numero } from '../../nucleo/formato';
import { Selo } from '../../ui/selo';
import { ROTULO_STATUS, alvoDaOrdem } from '../campanhas/textos';
import { FotoDaOrdem } from './foto-da-ordem';
import {
  ROTULO_ACAO,
  ROTULO_AVISO,
  ROTULO_CONFLITO,
  ROTULO_SITUACAO_EVENTO,
  distancia,
  encerramentoComValores,
  valorDoParametro,
} from './textos';

export interface DadosExecucao {
  ordem: OrdemServico;
}

/**
 * O que o campo registrou na OS (J9, J11; ADR 0045): os eventos do app na ordem, com hora
 * do celular, quem, motivo, avisos e o que o servidor fez; os valores do encerramento com
 * os rótulos da versão do serviço; as fotos e os conflitos.
 */
@Component({
  selector: 'aurora-execucao-ordem',
  imports: [MatDialogModule, MatButtonModule, Selo, FotoDaOrdem],
  templateUrl: './execucao-ordem.html',
  styleUrl: './execucao-ordem.scss',
})
export class ExecucaoOrdemDialogo {
  protected readonly dados = inject<DadosExecucao>(MAT_DIALOG_DATA);
  protected readonly execucao = httpResource<ExecucaoDaOrdem>(
    () => `/api/v1/ordens/${this.dados.ordem.id}/execucao`,
  );
  protected readonly fmt = { dataEHora, numero, distancia };
  protected readonly rotulos = {
    acao: ROTULO_ACAO,
    situacao: ROTULO_SITUACAO_EVENTO,
    aviso: ROTULO_AVISO,
    conflito: ROTULO_CONFLITO,
    status: ROTULO_STATUS,
  };
  protected readonly alvo = alvoDaOrdem(this.dados.ordem);

  protected readonly encerramento = computed(() =>
    encerramentoComValores(this.execucao.value()?.eventos ?? []),
  );
  /** Parâmetros com o valor informado no encerramento (fotos à parte). */
  protected readonly valores = computed(() => {
    const e = this.encerramento();
    const valores = (e?.valores ?? {}) as Record<string, unknown>;
    return (this.execucao.value()?.parametros ?? [])
      .filter((p) => p.tipo !== 'FOTO' && p.chave in valores)
      .map((p) => ({ rotulo: p.rotulo, valor: valorDoParametro(p, valores[p.chave]) }));
  });
  protected readonly fotos = computed(() => {
    const rotulos = new Map(
      (this.execucao.value()?.parametros ?? []).map((p) => [p.chave, p.rotulo] as const),
    );
    return (this.execucao.value()?.anexos ?? [])
      .filter((a) => a.situacao === 'DISPONIVEL')
      .map((a) => ({
        id: a.id,
        descricao: (a.parametro && rotulos.get(a.parametro)) || 'Foto da OS',
      }));
  });
  protected readonly fotosPendentes = computed(
    () => (this.execucao.value()?.anexos ?? []).filter((a) => a.situacao === 'RECEBENDO').length,
  );
  protected readonly fotosRecusadas = computed(() =>
    (this.execucao.value()?.anexos ?? []).filter((a) => a.situacao === 'RECUSADO'),
  );
}
