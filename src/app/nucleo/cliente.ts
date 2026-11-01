import type { ConfiguracaoAurora } from './configuracao';

/** Cliente (empresa) escolhido na tela de entrada (ADR 0027); fica no navegador para os próximos acessos. */
export interface ClienteEscolhido {
  codigo: string;
  nome: string;
  emissor: string;
  temLogo: boolean;
}

export const ROTA_ACESSO = 'acesso';
export const ROTA_PLATAFORMA = 'plataforma';
const CHAVE = 'aurora.cliente';

export function clienteEscolhido(armazenamento: Storage = localStorage): ClienteEscolhido | null {
  try {
    const lido = JSON.parse(armazenamento.getItem(CHAVE) ?? 'null') as Partial<ClienteEscolhido> | null;
    return lido && typeof lido.codigo === 'string' && typeof lido.emissor === 'string' && typeof lido.nome === 'string'
      ? { codigo: lido.codigo, nome: lido.nome, emissor: lido.emissor, temLogo: lido.temLogo === true }
      : null;
  } catch {
    return null;
  }
}

export function lembrarCliente(cliente: ClienteEscolhido, armazenamento: Storage = localStorage): void {
  armazenamento.setItem(CHAVE, JSON.stringify(cliente));
}

export function esquecerCliente(armazenamento: Storage = localStorage): void {
  armazenamento.removeItem(CHAVE);
}

/** Código como a API aceita: minúsculas, números e hífens. */
export function normalizarCodigo(texto: string): string {
  return texto.trim().toLowerCase();
}

/** Consulta pública pelo código (sem login); null se não existe, está inativo ou incompleto. */
export async function buscarCliente(codigo: string, buscar: typeof fetch = fetch): Promise<ClienteEscolhido | null> {
  const resposta = await buscar(`/api/v1/publico/clientes/${encodeURIComponent(normalizarCodigo(codigo))}`);
  if (resposta.status === 404) {
    return null;
  }
  if (!resposta.ok) {
    throw new Error(`Falha ao consultar o código (${resposta.status})`);
  }
  return (await resposta.json()) as ClienteEscolhido;
}

export type ModoDeLogin =
  | { modo: 'plataforma'; emissor: string; clienteId: string }
  | { modo: 'cliente'; emissor: string; clienteId: string; cliente: ClienteEscolhido | null }
  | { modo: 'escolher' };

/**
 * Onde a pessoa entra, decidido antes de o Angular iniciar (a biblioteca OIDC recebe um emissor fixo):
 * /plataforma usa o realm da plataforma; com escolha de cliente, o realm do cliente lembrado, ou a tela do código.
 */
export function modoDeLogin(configuracao: ConfiguracaoAurora, caminho: string, cliente: ClienteEscolhido | null): ModoDeLogin {
  const plataforma = caminho === `/${ROTA_PLATAFORMA}` || caminho.startsWith(`/${ROTA_PLATAFORMA}/`);
  if (plataforma && configuracao.emissorPlataforma && configuracao.clientePlataforma) {
    return { modo: 'plataforma', emissor: configuracao.emissorPlataforma, clienteId: configuracao.clientePlataforma };
  }
  if (!configuracao.escolherCliente) {
    return { modo: 'cliente', emissor: configuracao.emissor, clienteId: configuracao.clienteId, cliente: null };
  }
  return cliente
    ? { modo: 'cliente', emissor: cliente.emissor, clienteId: configuracao.clienteId, cliente }
    : { modo: 'escolher' };
}
