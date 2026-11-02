import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { SessaoService } from './sessao';

/**
 * Telas da barra lateral e a permissão que cada uma exige (doc 08, 8.4). O menu mostra só o que a pessoa pode abrir,
 * e a entrada leva à primeira tela permitida (ex.: o perfil Auditor não cai num Painel sem acesso).
 */
export interface Tela {
  rota: string;
  rotulo: string;
  permissao: string;
}

export const SECOES: { titulo: string; telas: Tela[] }[] = [
  {
    titulo: 'Adesão',
    telas: [
      { rota: '/painel', rotulo: 'Painel', permissao: 'indicador:ler' },
      { rota: '/metas', rotulo: 'Metas', permissao: 'indicador:ler' },
      { rota: '/sem-ligacao', rotulo: 'Sem ligação', permissao: 'indicador:ler' },
      { rota: '/mapa', rotulo: 'Mapa', permissao: 'indicador:ler' },
      { rota: '/alertas', rotulo: 'Alertas', permissao: 'indicador:ler' },
    ],
  },
  {
    titulo: 'Contrato',
    telas: [
      { rota: '/contratos', rotulo: 'Contratos', permissao: 'contrato:ler' },
      { rota: '/simulador', rotulo: 'Simulador', permissao: 'indicador:ler' },
      { rota: '/assistente', rotulo: 'Assistente', permissao: 'assistente:usar' },
    ],
  },
  {
    titulo: 'Campo',
    telas: [
      { rota: '/campanhas', rotulo: 'Campanhas', permissao: 'campanha:gerenciar' },
      { rota: '/equipes', rotulo: 'Equipes', permissao: 'campanha:gerenciar' },
      { rota: '/minhas-ordens', rotulo: 'Minhas OS', permissao: 'os:executar' },
    ],
  },
  {
    titulo: 'Administração',
    telas: [
      { rota: '/admin/unidades', rotulo: 'Unidades', permissao: 'unidade:ler' },
      { rota: '/admin/usuarios', rotulo: 'Usuários', permissao: 'usuario:gerenciar' },
      { rota: '/admin/perfis', rotulo: 'Perfis', permissao: 'usuario:gerenciar' },
      { rota: '/admin/auditoria', rotulo: 'Auditoria', permissao: 'auditoria:ler' },
      { rota: '/admin/integracoes', rotulo: 'Integrações', permissao: 'integracao:gerenciar' },
    ],
  },
];

/** Seções com só as telas permitidas; seção vazia some. */
export function secoesPermitidas(permissoes: readonly string[]): { titulo: string; telas: Tela[] }[] {
  return SECOES.map((s) => ({ titulo: s.titulo, telas: s.telas.filter((t) => permissoes.includes(t.permissao)) })).filter(
    (s) => s.telas.length > 0,
  );
}

/**
 * Tela de entrada: o Painel para quem acompanha a adesão; senão, a primeira permitida. Sem nenhuma, o Painel (que
 * explica a falta de acesso).
 */
export function telaInicial(permissoes: readonly string[]): string {
  return secoesPermitidas(permissoes)[0]?.telas[0]?.rota ?? '/painel';
}

/** Rota vazia: leva à tela inicial do perfil. */
export const irParaTelaInicial: CanActivateFn = async () => {
  // inject() só vale antes do primeiro await.
  const sessao = inject(SessaoService);
  const roteador = inject(Router);
  const usuario = await sessao.aguardarUsuario();
  return roteador.parseUrl(telaInicial(usuario?.permissoes ?? ['indicador:ler']));
};
