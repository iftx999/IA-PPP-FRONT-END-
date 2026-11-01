import { Routes } from '@angular/router';
import { Shell } from './layout/shell';
import { ROTA_RETORNO, RetornoDoLogin, exigirLogin } from './nucleo/autenticacao';
import { ROTA_ACESSO, ROTA_PLATAFORMA } from './nucleo/cliente';
import { irParaTelaInicial } from './nucleo/telas';

/** Telas na ordem da barra lateral (docs/01, seção 1.4). */
const telas: Routes = [
  { path: '', pathMatch: 'full', canActivate: [irParaTelaInicial], children: [] },
  { path: 'painel', title: 'Painel · Aurora', loadComponent: () => import('./paginas/painel/painel').then((m) => m.Painel) },
  { path: 'metas', title: 'Metas · Aurora', loadComponent: () => import('./paginas/metas/metas').then((m) => m.Metas) },
  { path: 'sem-ligacao', title: 'Sem ligação · Aurora', loadComponent: () => import('./paginas/sem-ligacao/sem-ligacao').then((m) => m.SemLigacao) },
  { path: 'mapa', title: 'Mapa · Aurora', loadComponent: () => import('./paginas/mapa/mapa').then((m) => m.Mapa) },
  { path: 'alertas', title: 'Alertas · Aurora', loadComponent: () => import('./paginas/alertas/alertas').then((m) => m.Alertas) },
  { path: 'contratos', title: 'Contratos · Aurora', loadComponent: () => import('./paginas/contratos/contratos').then((m) => m.Contratos) },
  { path: 'contratos/:id', title: 'Contrato · Aurora', loadComponent: () => import('./paginas/contratos/contrato').then((m) => m.ContratoPagina) },
  { path: 'simulador', title: 'Simulador · Aurora', loadComponent: () => import('./paginas/simulador/simulador').then((m) => m.Simulador) },
  { path: 'assistente', title: 'Assistente · Aurora', loadComponent: () => import('./paginas/assistente/assistente').then((m) => m.Assistente) },
  { path: 'admin/unidades', title: 'Unidades · Aurora', loadComponent: () => import('./paginas/unidades/unidades').then((m) => m.Unidades) },
  { path: 'admin/usuarios', title: 'Usuários · Aurora', loadComponent: () => import('./paginas/usuarios/usuarios').then((m) => m.Usuarios) },
  { path: 'admin/perfis', title: 'Perfis · Aurora', loadComponent: () => import('./paginas/perfis/perfis').then((m) => m.Perfis) },
  { path: 'admin/auditoria', title: 'Auditoria · Aurora', loadComponent: () => import('./paginas/auditoria/auditoria').then((m) => m.Auditoria) },
  { path: 'admin/integracoes', title: 'Integrações · Aurora', loadComponent: () => import('./paginas/integracoes/integracoes').then((m) => m.Integracoes) },
];

/** Tudo exige login: sem sessão, o guard guarda a rota pedida e leva ao Keycloak; a volta é por /entrar. */
export const routes: Routes = [
  { path: ROTA_RETORNO, component: RetornoDoLogin },
  // ADR 0027: tela do código da empresa (sem login) e administração da plataforma (realm próprio, sem o menu).
  { path: ROTA_ACESSO, title: 'Entrar · Aurora', loadComponent: () => import('./paginas/acesso/acesso').then((m) => m.Acesso) },
  { path: `${ROTA_PLATAFORMA}/${ROTA_RETORNO}`, component: RetornoDoLogin },
  {
    path: ROTA_PLATAFORMA,
    title: 'Plataforma · Aurora',
    canActivate: [exigirLogin],
    loadComponent: () => import('./paginas/plataforma/plataforma').then((m) => m.Plataforma),
  },
  { path: '', component: Shell, canActivate: [exigirLogin], children: telas },
  { path: '**', redirectTo: '' },
];
