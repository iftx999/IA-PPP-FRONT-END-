import { Routes } from '@angular/router';
import { autoLoginPartialRoutesGuard } from 'angular-auth-oidc-client';
import { Shell } from './layout/shell';

const emConstrucao = () => import('./paginas/em-construcao').then((m) => m.EmConstrucao);

/** Telas na ordem da barra lateral (docs/01, seção 1.4). */
const telas: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'painel' },
  { path: 'painel', title: 'Painel · Aurora', loadComponent: () => import('./paginas/painel/painel').then((m) => m.Painel) },
  { path: 'metas', title: 'Metas · Aurora', loadComponent: () => import('./paginas/metas/metas').then((m) => m.Metas) },
  { path: 'sem-ligacao', title: 'Sem ligação · Aurora', loadComponent: () => import('./paginas/sem-ligacao/sem-ligacao').then((m) => m.SemLigacao) },
  { path: 'mapa', title: 'Mapa · Aurora', loadComponent: emConstrucao,
    data: { secao: 'Adesão', titulo: 'Mapa', marco: 'Marco 5 — GIS' } },
  { path: 'alertas', title: 'Alertas · Aurora', loadComponent: emConstrucao,
    data: { secao: 'Adesão', titulo: 'Alertas', marco: 'Marco 3 — Operação' } },
  { path: 'contratos', title: 'Contratos · Aurora', loadComponent: emConstrucao,
    data: { secao: 'Contrato', titulo: 'Contratos', marco: 'Marco 2 — Contratos + IA' } },
  { path: 'assistente', title: 'Assistente · Aurora', loadComponent: emConstrucao,
    data: { secao: 'Contrato', titulo: 'Assistente', marco: 'Marco 4 — Assistente' } },
  { path: 'admin/unidades', title: 'Unidades · Aurora', loadComponent: emConstrucao,
    data: { secao: 'Administração', titulo: 'Unidades', marco: 'Marco 1 — Acesso e núcleo' } },
  { path: 'admin/usuarios', title: 'Usuários · Aurora', loadComponent: emConstrucao,
    data: { secao: 'Administração', titulo: 'Usuários', marco: 'Marco 1 — Acesso e núcleo' } },
  { path: 'admin/perfis', title: 'Perfis · Aurora', loadComponent: emConstrucao,
    data: { secao: 'Administração', titulo: 'Perfis', marco: 'Marco 1 — Acesso e núcleo' } },
  { path: 'admin/integracoes', title: 'Integrações · Aurora', loadComponent: emConstrucao,
    data: { secao: 'Administração', titulo: 'Integrações', marco: 'Marco 3 — Operação' } },
];

/** Tudo exige login: sem sessão, o guard leva ao Keycloak e volta para a rota pedida. */
export const routes: Routes = [
  { path: '', component: Shell, canActivate: [autoLoginPartialRoutesGuard], children: telas },
  { path: '**', redirectTo: '' },
];
