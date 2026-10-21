import { expect, test } from '@playwright/test';
import { entrar } from './login';

test.describe('Painel de adesão', () => {
  test('administrador vê a Concessão A com os números do demo', async ({ page }) => {
    await entrar(page, 'admin@exemplo.dev');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Concessão A');
    await expect(page.getByText('Grupo Saneamento Exemplo').first()).toBeVisible();
    await expect(page.getByText('76,9%').first()).toBeVisible();
    await expect(page.getByText('Atenção').first()).toBeVisible();
    await expect(page.getByText('a meta sai em dez/2026')).toBeVisible();
    await expect(page.getByText('Ver os 2.639 imóveis sem ligação')).toBeVisible();
    await expect(page.locator('aurora-grafico-adesao svg')).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/painel-concessao.png', fullPage: true });

    // Detalhar por unidade (B4) e voltar.
    await page.getByRole('button', { name: 'Cidade B' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cidade B');
    await expect(page.getByText('Abaixo do alerta').first()).toBeVisible();
    await page.getByRole('link', { name: /Voltar para Concessão A/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Concessão A');
  });

  test('usuário com escopo na Cidade A não vê a concessão', async ({ page }) => {
    await entrar(page, 'comercial.cidadea@exemplo.dev');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cidade A');
    await expect(page.getByRole('link', { name: /Voltar para/ })).toHaveCount(0);
    await page.screenshot({ path: 'e2e/capturas/painel-cidade-a.png', fullPage: true });
  });
});
