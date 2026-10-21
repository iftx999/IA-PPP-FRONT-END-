import { expect, type Page } from '@playwright/test';

export async function entrar(page: Page, email: string, caminho = '/painel'): Promise<void> {
  await page.goto(caminho);
  // Sem sessão, o guard leva ao Keycloak.
  await page.waitForURL(/\/realms\/aurora\//);
  await page.locator('#username').fill(email);
  await page.locator('#password').fill('aurora-dev');
  await page.locator('#kc-login').click();
  await page.waitForURL((url) => url.origin === new URL(page.url()).origin && url.port === '4200');
  await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
}
