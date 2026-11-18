import type {
  AcaoCampanha,
  Conferencia,
  FunilCampanha,
  ImpactoNaMeta,
  MotivoDaOrdem,
  OrdemServico,
  OrigemCampanha,
  OrigemOrdem,
  Prioridade,
  ResultadoOrdem,
  StatusCampanha,
  StatusOrdem,
} from '../../api/tipos';
import type { Tom } from '../../ui/selo';
import { numero, percentual } from '../../nucleo/formato';

/** Rótulos das campanhas e ordens de serviço (ADR 0036, 0044). */

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

/** Ciclo da OS (doc 10, 10.6). */
export const ROTULO_STATUS: Record<StatusOrdem, { texto: string; tom: Tom }> = {
  PLANEJADA: { texto: 'Planejada', tom: 'neutro' },
  PROGRAMADA: { texto: 'Programada', tom: 'atencao' },
  EM_EXECUCAO: { texto: 'Em execução', tom: 'atencao' },
  PARALISADA: { texto: 'Paralisada', tom: 'perigo' },
  DEVOLVIDA: { texto: 'Devolvida', tom: 'perigo' },
  ENCERRADA: { texto: 'Encerrada', tom: 'ok' },
  CANCELADA: { texto: 'Cancelada', tom: 'neutro' },
};

export const STATUS_DA_OS: StatusOrdem[] = [
  'PLANEJADA',
  'PROGRAMADA',
  'EM_EXECUCAO',
  'PARALISADA',
  'DEVOLVIDA',
  'ENCERRADA',
  'CANCELADA',
];

/** O que a tabela do doc 10 (10.6) permite em cada situação (o servidor confere o mesmo). */
export const podeProgramar = (s: StatusOrdem): boolean =>
  s === 'PLANEJADA' || s === 'PROGRAMADA' || s === 'DEVOLVIDA';
export const podeCancelar = podeProgramar;
export const comEquipe = (s: StatusOrdem): boolean =>
  s === 'PROGRAMADA' || s === 'EM_EXECUCAO' || s === 'PARALISADA';
export const podeEncerrar = (s: StatusOrdem): boolean => s === 'PROGRAMADA' || s === 'EM_EXECUCAO';

export const ROTULO_ORIGEM_OS: Record<OrigemOrdem, string> = {
  CAMPANHA: 'Campanha',
  AVULSA: 'Avulsa',
  LOTE: 'Lote por logradouro',
};

export const ROTULO_PRIORIDADE: Record<Prioridade, { texto: string; tom: Tom }> = {
  EMERGENCIAL: { texto: 'Emergencial', tom: 'perigo' },
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
  NAO_EXECUTADA: 'Não executada',
};

/** Motivos do catálogo do tipo pedido que valem para o serviço (RN-22; o servidor confere o mesmo). */
export function motivosPara(
  motivos: readonly MotivoDaOrdem[],
  tipo: MotivoDaOrdem['tipo'],
  servicoId: string,
): MotivoDaOrdem[] {
  return motivos.filter(
    (m) => m.tipo === tipo && (m.servicoId == null || m.servicoId === servicoId),
  );
}

/** Onde a OS acontece, numa linha: matrícula (e endereço) ou trecho do logradouro. */
export function alvoDaOrdem(
  o: Pick<
    OrdemServico,
    'alvo' | 'matricula' | 'trechoCodigo' | 'logradouroNome' | 'numeroImovel' | 'complemento'
  >,
): string {
  if (o.alvo === 'TRECHO') {
    return [`Trecho ${o.trechoCodigo ?? ''}`.trim(), o.logradouroNome].filter(Boolean).join(' · ');
  }
  const endereco = o.logradouroNome
    ? [o.logradouroNome, o.numeroImovel, o.complemento].filter(Boolean).join(', ')
    : null;
  return [`Matrícula ${o.matricula ?? ''}`.trim(), endereco].filter(Boolean).join(' · ');
}

/** Quantidade com a unidade do serviço (UN, M, M2, M3). */
export function quantidadeComUnidade(valor: number | null | undefined, unidade: string): string {
  if (valor == null) {
    return '—';
  }
  const simbolo: Record<string, string> = { UN: 'un.', M: 'm', M2: 'm²', M3: 'm³' };
  return `${numero(valor)} ${simbolo[unidade] ?? unidade}`;
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
