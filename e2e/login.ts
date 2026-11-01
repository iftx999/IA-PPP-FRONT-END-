import { expect, type Page } from '@playwright/test';

/** Tela do código da empresa (ADR 0027): navegador sem empresa lembrada passa por ela antes do Keycloak. */
export async function informarCodigo(page: Page, codigo = 'aurora'): Promise<void> {
  await page.getByLabel('Código da empresa').fill(codigo);
  await page.getByRole('button', { name: 'Continuar' }).click();
}

export async function entrar(page: Page, email: string, caminho = '/painel', codigo = 'aurora'): Promise<void> {
  await page.goto(caminho);
  // Sem sessão, o guard leva ao Keycloak (antes, à tela do código se a empresa não está lembrada).
  await page.waitForURL((url) => url.pathname === '/acesso' || /\/realms\//.test(url.pathname));
  if (new URL(page.url()).pathname === '/acesso') {
    await informarCodigo(page, codigo);
  }
  await page.waitForURL(/\/realms\/[^/]+\/protocol/);
  await page.locator('#username').fill(email);
  await page.locator('#password').fill('aurora-dev');
  await page.locator('#kc-login').click();
  await page.waitForURL((url) => url.origin === new URL(page.url()).origin && url.port === '4200');
  await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
  // Volta exatamente para a rota pedida (antes, uma corrida no retorno às vezes levava ao Painel).
  const pedido = new URL(caminho, 'http://x').pathname;
  await expect(page).toHaveURL((url) => url.pathname === pedido);
}
