import { Routes } from '@angular/router';

const emConstrucao = () => import('./paginas/em-construcao').then((m) => m.EmConstrucao);

/** Menu e rotas na ordem da barra lateral (docs/01, seção 1.4). */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'painel' },
  { path: 'painel', title: 'Painel · Aurora', loadComponent: emConstrucao,
    data: { secao: 'Adesão', titulo: 'Painel', marco: 'Marco 1 — Acesso e núcleo' } },
  { path: 'metas', title: 'Metas · Aurora', loadComponent: emConstrucao,
    data: { secao: 'Adesão', titulo: 'Metas', marco: 'Marco 1 — Acesso e núcleo' } },
  { path: 'sem-ligacao', title: 'Sem ligação · Aurora', loadComponent: emConstrucao,
    data: { secao: 'Adesão', titulo: 'Imóveis sem ligação', marco: 'Marco 1 — Acesso e núcleo' } },
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
  { path: '**', redirectTo: 'painel' },
];
