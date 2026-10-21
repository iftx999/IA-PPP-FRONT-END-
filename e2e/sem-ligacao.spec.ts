import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { entrar } from './login';

test.describe('Imóveis sem ligação', () => {
  test('do painel para a lista, carregar mais e exportar CSV', async ({ page }) => {
    await entrar(page, 'admin@exemplo.dev');
    await page.getByRole('link', { name: /Ver os 2\.639 imóveis sem ligação/ }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Concessão A');
    await expect(page.getByRole('tab', { name: /Todos 2\.639/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: /Factíveis 2\.431/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Cortados 208/ })).toBeVisible();
    await expect(page.getByText('Mostrando 50 de 2.639')).toBeVisible();
    await expect(page.getByText('Matrículas parcialmente ocultas')).toHaveCount(0);

    await page.getByRole('button', { name: 'Carregar mais' }).click();
    await expect(page.getByText('Mostrando 100 de 2.639')).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/sem-ligacao.png' });

    await page.getByRole('tab', { name: /Cortados/ }).click();
    await expect(page.getByText('Mostrando 50 de 208')).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar CSV' }).click();
    const arquivo = await download;
    expect(arquivo.suggestedFilename()).toBe('imoveis-sem-ligacao-2026-08.csv');
    const csv = readFileSync((await arquivo.path())!, 'utf-8');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(209);
  });

  test('diretoria vê as matrículas mascaradas', async ({ page }) => {
    await entrar(page, 'diretoria@exemplo.dev', '/sem-ligacao');

    await expect(page.getByText('Matrículas parcialmente ocultas')).toBeVisible();
    await expect(page.locator('td.matricula').first()).toHaveText(/^••••\d{3}$/);
  });
});
