import { Routes } from '@angular/router';
import { Shell } from './layout/shell';
import { ROTA_RETORNO, RetornoDoLogin, exigirLogin } from './nucleo/autenticacao';

/** Telas na ordem da barra lateral (docs/01, seção 1.4). */
const telas: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'painel' },
  { path: 'painel', title: 'Painel · Aurora', loadComponent: () => import('./paginas/painel/painel').then((m) => m.Painel) },
  { path: 'metas', title: 'Metas · Aurora', loadComponent: () => import('./paginas/metas/metas').then((m) => m.Metas) },
  { path: 'sem-ligacao', title: 'Sem ligação · Aurora', loadComponent: () => import('./paginas/sem-ligacao/sem-ligacao').then((m) => m.SemLigacao) },
  { path: 'mapa', title: 'Mapa · Aurora', loadComponent: () => import('./paginas/mapa/mapa').then((m) => m.Mapa) },
  { path: 'alertas', title: 'Alertas · Aurora', loadComponent: () => import('./paginas/alertas/alertas').then((m) => m.Alertas) },
  { path: 'contratos', title: 'Contratos · Aurora', loadComponent: () => import('./paginas/contratos/contratos').then((m) => m.Contratos) },
  { path: 'contratos/:id', title: 'Contrato · Aurora', loadComponent: () => import('./paginas/contratos/contrato').then((m) => m.ContratoPagina) },
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
  { path: '', component: Shell, canActivate: [exigirLogin], children: telas },
  { path: '**', redirectTo: '' },
];
