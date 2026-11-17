import type {
  AlvoServico,
  DefinicaoServico,
  ParametroServico,
  PerfilRota,
  Servico,
  TipoMotivo,
  TipoParametro,
  UnidadeMedida,
} from '../../api/tipos';
import { numero } from '../../nucleo/formato';

/** Rótulos e regras de tela do catálogo de serviços (ADR 0042, doc 10). */
export const ROTULO_ALVO: Record<AlvoServico, string> = {
  IMOVEL: 'Imóvel',
  TRECHO: 'Trecho de logradouro',
  AMBOS: 'Imóvel ou trecho',
};

export const ROTULO_UNIDADE: Record<UnidadeMedida, { curto: string; longo: string }> = {
  UN: { curto: 'un', longo: 'Unidade' },
  M: { curto: 'm', longo: 'Metro' },
  M2: { curto: 'm²', longo: 'Metro quadrado' },
  M3: { curto: 'm³', longo: 'Metro cúbico' },
};

export const ROTULO_TIPO_PARAMETRO: Record<TipoParametro, { rotulo: string; icone: string }> = {
  SIM_NAO: { rotulo: 'Sim ou não', icone: 'toggle_on' },
  LISTA: { rotulo: 'Lista (uma opção)', icone: 'radio_button_checked' },
  LISTA_MULTIPLA: { rotulo: 'Lista (várias opções)', icone: 'checklist' },
  INTEIRO: { rotulo: 'Número inteiro', icone: 'pin' },
  DECIMAL: { rotulo: 'Número decimal', icone: 'straighten' },
  TEXTO: { rotulo: 'Texto', icone: 'notes' },
  DATA_HORA: { rotulo: 'Data e hora', icone: 'event' },
  FOTO: { rotulo: 'Foto', icone: 'photo_camera' },
};

export const ROTULO_TIPO_MOTIVO: Record<TipoMotivo, { rotulo: string; descricao: string }> = {
  PARALISACAO: {
    rotulo: 'Paralisação',
    descricao: 'O agente para a OS em execução e retoma depois.',
  },
  DEVOLUCAO: {
    rotulo: 'Devolução',
    descricao: 'A OS volta para a programação reprogramar ou cancelar.',
  },
  NAO_EXECUCAO: { rotulo: 'Não execução', descricao: 'A OS é encerrada sem o serviço feito.' },
  CANCELAMENTO: {
    rotulo: 'Cancelamento',
    descricao: 'A programação cancela a OS antes da execução.',
  },
};

export const ROTULO_PERFIL_ROTA: Record<PerfilRota, string> = {
  MOTO: 'Moto',
  CARRO: 'Carro',
  CAMINHAO: 'Caminhão',
};

/** "20 min", "3 min/m", "1 h 30 min". */
export function tempoPadrao(
  d: Pick<DefinicaoServico, 'tempoPadraoMin' | 'tempoPorUnidade' | 'unidadeMedida'>,
): string {
  const minutos = d.tempoPadraoMin;
  const base =
    minutos >= 60 && Number.isInteger(minutos)
      ? `${Math.floor(minutos / 60)} h${minutos % 60 ? ` ${minutos % 60} min` : ''}`
      : `${numero(minutos)} min`;
  return d.tempoPorUnidade ? `${base}/${ROTULO_UNIDADE[d.unidadeMedida].curto}` : base;
}

/** "Emergencial 24 h · alta 2 · média 5 · baixa 10 dias úteis". */
export function resumoDosPrazos(d: Pick<DefinicaoServico, 'prazos'>): string {
  const p = d.prazos;
  return `Emergencial ${p.emergencialHoras} h · alta ${p.altaDias} · média ${p.mediaDias} · baixa ${p.baixaDias} dias úteis`;
}

/** Faixa do parâmetro para a pré-visualização ("0 a 200 m", "1 a 3 fotos", "até 500 caracteres"). */
export function faixaDoParametro(p: ParametroServico): string | null {
  const { minimo: min, maximo: max } = p;
  if (min == null && max == null) {
    return null;
  }
  const sufixo =
    p.tipo === 'FOTO'
      ? max === 1
        ? ' foto'
        : ' fotos'
      : p.tipo === 'TEXTO'
        ? ' caracteres'
        : p.unidade
          ? ` ${p.unidade}`
          : '';
  if (min != null && max != null) {
    return min === max ? `${numero(min)}${sufixo}` : `${numero(min)} a ${numero(max)}${sufixo}`;
  }
  return min != null ? `a partir de ${numero(min)}${sufixo}` : `até ${numero(max!)}${sufixo}`;
}

/** Parâmetros que podem ser a origem de uma condição do parâmetro na posição {@code indice}. */
export function origensDeCondicao(
  parametros: readonly ParametroServico[],
  indice: number,
): ParametroServico[] {
  return parametros.slice(0, indice).filter((p) => p.tipo === 'SIM_NAO' || p.tipo === 'LISTA');
}

/** Valores possíveis da condição para a origem escolhida. */
export function valoresDaCondicao(
  origem: ParametroServico | undefined,
): { valor: string; rotulo: string }[] {
  if (!origem) {
    return [];
  }
  return origem.tipo === 'SIM_NAO'
    ? [
        { valor: 'true', rotulo: 'Sim' },
        { valor: 'false', rotulo: 'Não' },
      ]
    : (origem.opcoes ?? []).map((o) => ({ valor: o, rotulo: o }));
}

/** "meu campo" → "meu_campo" (chave do parâmetro a partir do rótulo). */
export function chaveDoRotulo(rotulo: string): string {
  const chave = rotulo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return /^[a-z]/.test(chave) ? chave : chave ? `p_${chave}`.slice(0, 40) : '';
}

/** Filtro da lista de serviços (no cliente: o catálogo vem inteiro). */
export function filtrarServicos(
  servicos: readonly Servico[],
  filtro: { termo: string; grupo: string | null; inativos: boolean },
): Servico[] {
  const termo = filtro.termo.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  return servicos.filter((s) => {
    if (!filtro.inativos && !s.ativo) {
      return false;
    }
    if (filtro.grupo && s.grupoId !== filtro.grupo) {
      return false;
    }
    if (!termo) {
      return true;
    }
    const alvo = `${s.definicao.nome} ${s.codigo}`
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();
    return alvo.includes(termo);
  });
}

/** Parâmetros visíveis na pré-visualização, dados os valores já escolhidos (condições). */
export function parametrosVisiveis(
  parametros: readonly ParametroServico[],
  valores: Readonly<Record<string, string | undefined>>,
): ParametroServico[] {
  return parametros.filter((p) => !p.condicao || valores[p.condicao.chave] === p.condicao.valor);
}
