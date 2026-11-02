import type {
  AcaoCampanha,
  Conferencia,
  FunilCampanha,
  ImpactoNaMeta,
  MotivoResultado,
  OrdemServico,
  OrigemCampanha,
  Prioridade,
  ResultadoOrdem,
  StatusCampanha,
  StatusOrdem,
  TipoOrdem,
} from '../../api/tipos';
import type { Tom } from '../../ui/selo';
import { numero, percentual } from '../../nucleo/formato';

/** Rótulos das campanhas e ordens de serviço (ADR 0036). */
export const ROTULO_TIPO: Record<TipoOrdem, string> = {
  VISTORIA: 'Vistoria',
  LIGACAO_NOVA: 'Ligação nova',
  RELIGACAO: 'Religação',
  NOTIFICACAO: 'Notificação',
};

export const ROTULO_ACAO: Record<AcaoCampanha, { titulo: string; descricao: string }> = {
  LIGACAO: {
    titulo: 'Ligar',
    descricao: 'Factível vira ligação nova; cortado vira religação. A carga confere.',
  },
  VISTORIA: {
    titulo: 'Vistoriar',
    descricao: 'Visita técnica antes da ligação (viabilidade, cota, ramal).',
  },
  NOTIFICACAO: { titulo: 'Notificar', descricao: 'Aviso da obrigação de se ligar à rede.' },
};

export const ROTULO_ORIGEM: Record<OrigemCampanha, string> = {
  SEM_LIGACAO: 'Lista de sem ligação',
  AREA_DO_MAPA: 'Área do mapa',
  SETOR: 'Setor comercial',
};

export const ROTULO_STATUS_CAMPANHA: Record<StatusCampanha, { texto: string; tom: Tom }> = {
  ATIVA: { texto: 'Ativa', tom: 'ok' },
  ENCERRADA: { texto: 'Encerrada', tom: 'neutro' },
  CANCELADA: { texto: 'Cancelada', tom: 'neutro' },
};

export const ROTULO_STATUS: Record<StatusOrdem, { texto: string; tom: Tom }> = {
  PLANEJADA: { texto: 'Sem equipe', tom: 'neutro' },
  EM_CAMPO: { texto: 'Em campo', tom: 'atencao' },
  REAGENDADA: { texto: 'Reagendada', tom: 'atencao' },
  EXECUTADA: { texto: 'Executada', tom: 'ok' },
  RECUSADA: { texto: 'Recusada', tom: 'perigo' },
  INVIAVEL: { texto: 'Inviável', tom: 'perigo' },
  CANCELADA: { texto: 'Cancelada', tom: 'neutro' },
};

export const ROTULO_PRIORIDADE: Record<Prioridade, { texto: string; tom: Tom }> = {
  ALTA: { texto: 'Alta', tom: 'perigo' },
  MEDIA: { texto: 'Média', tom: 'atencao' },
  BAIXA: { texto: 'Baixa', tom: 'neutro' },
};

export const ROTULO_CONFERENCIA: Record<Conferencia, { texto: string; tom: Tom; dica: string }> = {
  NAO_SE_APLICA: {
    texto: '—',
    tom: 'neutro',
    dica: 'Vistoria e notificação não são conferidas pela carga.',
  },
  PENDENTE: {
    texto: 'Aguardando carga',
    tom: 'neutro',
    dica: 'A carga do mês da execução ou do seguinte vai conferir.',
  },
  CONFIRMADA: { texto: 'Confirmada', tom: 'ok', dica: 'A carga mostrou o imóvel ligado.' },
  DIVERGENTE: {
    texto: 'Divergente',
    tom: 'perigo',
    dica: 'A carga do mês seguinte ao da execução não mostra a ligação. Confira com a equipe e o sistema comercial.',
  },
};

export const ROTULO_RESULTADO: Record<ResultadoOrdem, string> = {
  EXECUTADA: 'Executada',
  RECUSADA: 'Recusada pelo morador',
  REAGENDADA: 'Reagendar',
  INVIAVEL: 'Inviável',
};

export const ROTULO_MOTIVO: Record<MotivoResultado, string> = {
  SEM_INTERESSE: 'Sem interesse',
  CUSTO_DA_LIGACAO: 'Custo da ligação',
  SOLUCAO_PROPRIA: 'Tem solução própria (fossa)',
  DEBITO_PENDENTE: 'Débito pendente',
  SEM_REDE_NA_RUA: 'Sem rede na rua',
  IMOVEL_ABAIXO_DA_REDE: 'Imóvel abaixo da rede',
  IMOVEL_DESOCUPADO: 'Imóvel desocupado',
  OUTRO: 'Outro (descreva)',
};

/** Motivos que combinam com cada resultado (o servidor confere o mesmo). */
export function motivosPara(resultado: ResultadoOrdem): MotivoResultado[] {
  if (resultado === 'RECUSADA') {
    return ['SEM_INTERESSE', 'CUSTO_DA_LIGACAO', 'SOLUCAO_PROPRIA', 'DEBITO_PENDENTE', 'OUTRO'];
  }
  if (resultado === 'INVIAVEL') {
    return ['SEM_REDE_NA_RUA', 'IMOVEL_ABAIXO_DA_REDE', 'IMOVEL_DESOCUPADO', 'OUTRO'];
  }
  return [];
}

/** Etapas do funil (I4), com a fração de cada uma sobre as planejadas. */
export function etapasDoFunil(
  f: FunilCampanha,
): { rotulo: string; valor: number; fracao: number }[] {
  const base = f.planejadas || 1;
  return [
    { rotulo: 'Planejadas', valor: f.planejadas, fracao: f.planejadas / base },
    { rotulo: 'Em campo', valor: f.emCampo, fracao: f.emCampo / base },
    { rotulo: 'Executadas', valor: f.executadas, fracao: f.executadas / base },
    { rotulo: 'Confirmadas', valor: f.confirmadas, fracao: f.confirmadas / base },
  ];
}

/** Frase do impacto na meta: quanto a adesão sobe e quanto da distância até a meta a campanha cobre. */
export function frasesDoImpacto(i: ImpactoNaMeta, ordens: number): string[] {
  if (i.adesao == null) {
    return [
      `${i.unidadeNome} não tem adesão medida na competência: o impacto não pode ser estimado.`,
    ];
  }
  const frases = [
    `Se as ${numero(ordens)} OS virarem ligação, a adesão de ${i.unidadeNome} vai de ${percentual(i.adesao)} para ${percentual(i.adesaoSeTodasLigarem)}.`,
  ];
  if (i.meta != null && i.faltamParaMeta != null) {
    if (i.faltamParaMeta === 0) {
      frases.push(`A meta de ${percentual(i.meta)} já está atingida.`);
    } else {
      const cobre = Math.min(ordens, i.faltamParaMeta);
      frases.push(
        `Faltam ${numero(i.faltamParaMeta)} ligações para a meta de ${percentual(i.meta)}: a campanha cobre ${numero(cobre)} (${percentual((cobre * 100) / i.faltamParaMeta)}).`,
      );
    }
  }
  return frases;
}

/** Variação da adesão desde a criação, em pontos percentuais (efeito real). */
export function variacaoDesdeACriacao(
  ligadosNaCriacao: number,
  comRedeNaCriacao: number,
  agora: ImpactoNaMeta,
): number | null {
  if (!comRedeNaCriacao || agora.adesao == null) {
    return null;
  }
  return Math.round((agora.adesao - (ligadosNaCriacao * 100) / comRedeNaCriacao) * 100) / 100;
}

/**
 * Ponto da OS como URI geo: (RFC 5870): o celular abre o aplicativo de mapas dele, sem a Aurora enviar a localização a
 * nenhum serviço externo.
 */
export function linkDoPonto(o: Pick<OrdemServico, 'latitude' | 'longitude'>): string | null {
  return o.latitude == null || o.longitude == null ? null : `geo:${o.latitude},${o.longitude}`;
}
