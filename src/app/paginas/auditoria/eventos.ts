/** Rótulos, ícones e grupos dos tipos de evento da trilha (doc 08, 8.7). Tipo novo aparece pelo código. */
export interface InfoEvento {
  rotulo: string;
  icone: string;
  grupo: string;
}

export const EVENTOS: Record<string, InfoEvento> = {
  LOGIN: { rotulo: 'Login', icone: 'login', grupo: 'Acesso e usuários' },
  USUARIO_CONVIDADO: { rotulo: 'Usuário convidado', icone: 'person_add', grupo: 'Acesso e usuários' },
  CONVITE_REENVIADO: { rotulo: 'Convite reenviado', icone: 'forward_to_inbox', grupo: 'Acesso e usuários' },
  CONVITE_ACEITO: { rotulo: 'Convite aceito', icone: 'how_to_reg', grupo: 'Acesso e usuários' },
  ACESSO_CONCEDIDO: { rotulo: 'Acesso concedido', icone: 'badge', grupo: 'Acesso e usuários' },
  ACESSO_ALTERADO: { rotulo: 'Acesso alterado', icone: 'badge', grupo: 'Acesso e usuários' },
  USUARIO_DESATIVADO: { rotulo: 'Usuário desativado', icone: 'person_off', grupo: 'Acesso e usuários' },
  USUARIO_REATIVADO: { rotulo: 'Usuário reativado', icone: 'person_check', grupo: 'Acesso e usuários' },
  REDEFINICAO_SENHA_ENVIADA: { rotulo: 'Link de nova senha enviado', icone: 'lock_reset', grupo: 'Acesso e usuários' },
  PERFIL_CRIADO: { rotulo: 'Perfil criado', icone: 'shield', grupo: 'Perfis' },
  PERFIL_ALTERADO: { rotulo: 'Perfil alterado', icone: 'shield', grupo: 'Perfis' },
  PERFIL_REMOVIDO: { rotulo: 'Perfil removido', icone: 'shield', grupo: 'Perfis' },
  UNIDADE_CRIADA: { rotulo: 'Unidade criada', icone: 'account_tree', grupo: 'Unidades' },
  UNIDADE_ALTERADA: { rotulo: 'Unidade alterada', icone: 'account_tree', grupo: 'Unidades' },
  UNIDADE_MOVIDA: { rotulo: 'Unidade movida', icone: 'drive_file_move', grupo: 'Unidades' },
  UNIDADE_INATIVADA: { rotulo: 'Unidade inativada', icone: 'block', grupo: 'Unidades' },
  UNIDADE_REATIVADA: { rotulo: 'Unidade reativada', icone: 'settings_backup_restore', grupo: 'Unidades' },
  META_DEFINIDA: { rotulo: 'Meta definida', icone: 'flag', grupo: 'Metas' },
  META_ENCERRADA: { rotulo: 'Meta encerrada', icone: 'event_busy', grupo: 'Metas' },
  META_REMOVIDA: { rotulo: 'Meta removida', icone: 'flag', grupo: 'Metas' },
  RELATORIO_EXPORTADO: { rotulo: 'Exportação', icone: 'download', grupo: 'Exportações e dados pessoais' },
  ACESSO_DADO_PESSOAL: { rotulo: 'Dado pessoal exibido', icone: 'visibility', grupo: 'Exportações e dados pessoais' },
  DOCUMENTO_CONTRATO_ENVIADO: { rotulo: 'Documento de contrato enviado', icone: 'upload_file', grupo: 'Contratos' },
  ITEM_CONTRATUAL_APROVADO: { rotulo: 'Item contratual aprovado', icone: 'task_alt', grupo: 'Contratos' },
  ITEM_CONTRATUAL_REJEITADO: { rotulo: 'Item contratual rejeitado', icone: 'cancel', grupo: 'Contratos' },
  FONTE_CRIADA: { rotulo: 'Fonte de dados criada', icone: 'database', grupo: 'Integrações' },
  CARGA_CONCLUIDA: { rotulo: 'Carga concluída', icone: 'cloud_done', grupo: 'Integrações' },
  MARCACAO_CRIADA: { rotulo: 'Marcação no mapa', icone: 'location_on', grupo: 'Mapa' },
  MARCACAO_REMOVIDA: { rotulo: 'Marcação removida', icone: 'location_off', grupo: 'Mapa' },
  IMOVEIS_GEOCODIFICADOS: { rotulo: 'Localização de imóveis recebida', icone: 'pin_drop', grupo: 'Integrações' },
};

export function infoEvento(tipo: string): InfoEvento {
  return EVENTOS[tipo] ?? { rotulo: tipo, icone: 'history', grupo: 'Outros' };
}

/** Tipos da API agrupados para o seletor, na ordem do catálogo acima. */
export function gruposDeEventos(tipos: string[]): { grupo: string; tipos: { codigo: string; rotulo: string }[] }[] {
  const ordem = Object.keys(EVENTOS);
  const posicao = (t: string) => (ordem.includes(t) ? ordem.indexOf(t) : ordem.length);
  const grupos = new Map<string, { codigo: string; rotulo: string }[]>();
  for (const codigo of [...tipos].sort((a, b) => posicao(a) - posicao(b))) {
    const info = infoEvento(codigo);
    grupos.set(info.grupo, [...(grupos.get(info.grupo) ?? []), { codigo, rotulo: info.rotulo }]);
  }
  return [...grupos.entries()].map(([grupo, lista]) => ({ grupo, tipos: lista }));
}

/** Detalhes do evento como pares legíveis: "vigenciaInicio" → "vigência início"; objetos viram JSON. */
export function paresDeDetalhes(detalhes: unknown): { chave: string; valor: string }[] {
  if (!detalhes || typeof detalhes !== 'object' || Array.isArray(detalhes)) {
    return detalhes == null ? [] : [{ chave: 'valor', valor: JSON.stringify(detalhes) }];
  }
  return Object.entries(detalhes as Record<string, unknown>).map(([chave, valor]) => ({
    chave: chave.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(),
    valor: valor == null ? '—' : typeof valor === 'object' ? JSON.stringify(valor) : String(valor),
  }));
}
