import { expect, test } from '@playwright/test';
import { entrar } from './login';

/**
 * Sessões e trilha de acesso (doc 08, 8.6 e 8.7; ADR 0028): "Sair de todos os dispositivos" encerra a sessão no
 * Keycloak, e logout, login e o encerramento aparecem na Auditoria (no ambiente local a importação roda a cada 20 s).
 * O encerramento pela API não gera "Logout" no Keycloak: só o "Sair" da própria pessoa gera.
 */
test.describe('Sessões e trilha de acesso', () => {
  test('sair de todos os dispositivos exige novo login e fica na auditoria', async ({ page, browser }) => {
    test.setTimeout(120_000);
    await entrar(page, 'auditoria@exemplo.dev', '/painel');
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await page.waitForURL(/\/realms\/[^/]+\/protocol|\/acesso/);
    await entrar(page, 'auditoria@exemplo.dev', '/painel');

    // Uma segunda sessão da mesma pessoa, em outro "dispositivo".
    const outro = await browser.newContext();
    const outraPagina = await outro.newPage();
    await entrar(outraPagina, 'auditoria@exemplo.dev', '/painel');

    await page.getByRole('button', { name: 'Menu da conta' }).click();
    await page.screenshot({ path: 'e2e/capturas/sessoes-menu.png' });
    await page.getByRole('menuitem', { name: 'Sair de todos os dispositivos' }).click();
    await page.waitForURL(/\/realms\/[^/]+\/protocol|\/acesso/);

    // No outro dispositivo, a sessão do Keycloak acabou: ir ao login pede a senha de novo.
    await outraPagina.goto('http://localhost:8180/realms/aurora/account');
    await expect(outraPagina.locator('#password')).toBeVisible();
    await outro.close();

    await entrar(page, 'auditoria@exemplo.dev', '/admin/auditoria');
    await expect(async () => {
      await page.reload();
      // O rótulo divide o elemento com o nome do ícone ("logout Logout").
      const tipo = (rotulo: RegExp) => page.getByRole('main').locator('.tipo', { hasText: rotulo }).first();
      await expect(tipo(/Sessões encerradas em todos os dispositivos/)).toBeVisible({ timeout: 2000 });
      await expect(tipo(/\bLogout\b/)).toBeVisible({ timeout: 2000 });
      await expect(tipo(/\bLogin\b/)).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 60_000, intervals: [5000] });
    await page.screenshot({ path: 'e2e/capturas/sessoes-auditoria.png' });
  });

  test('perfil sem painel vê só as telas permitidas e entra numa delas', async ({ page }) => {
    await entrar(page, 'auditoria@exemplo.dev', '/admin/auditoria');
    const menu = page.getByRole('navigation', { name: 'Menu principal' });
    await expect(menu.getByRole('link', { name: 'Auditoria' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Painel' })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Usuários' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Aurora, ir para o início' }).click();
    await expect(page).toHaveURL(/\/admin\/unidades$/);
  });
});
