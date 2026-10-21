import { expect, test } from '@playwright/test';
import { entrar } from './login';

test.describe('Metas', () => {
  test('árvore com herança e conflito de vigência explicado', async ({ page }) => {
    await entrar(page, 'admin@exemplo.dev', '/metas');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Metas');
    await expect(page.getByText(/metas cadastradas/)).toBeVisible();
    await expect(page.getByText('Contrato 001/2025, cláusula 7.2, p. 2')).toBeVisible();
    await expect(page.getByText(/Segue Cidade A · 85,0%/).first()).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/metas.png', fullPage: true });

    // Cidade B já tem meta sem fim: a API recusa (409) e a tela explica.
    await page.getByRole('button', { name: 'Nova meta' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Meta própria' });
    await dialogo.getByLabel('Unidade').selectOption({ label: 'Cidade B' });
    await dialogo.getByLabel('Meta (%)').fill('90');
    await dialogo.getByLabel('Limite de alerta (%)').fill('95');
    await dialogo.getByRole('button', { name: 'Salvar meta' }).click();
    await expect(dialogo.getByRole('alert')).toHaveText('O limite de alerta não pode ser maior que a meta.');

    await dialogo.getByLabel('Limite de alerta (%)').fill('85');
    await dialogo.getByRole('button', { name: 'Salvar meta' }).click();
    await expect(dialogo.getByRole('alert')).toHaveText('Já existe meta de Cidade B vigente nesse período.');
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();
  });

  test('perfil sem gestão de metas não vê as ações', async ({ page }) => {
    await entrar(page, 'diretoria@exemplo.dev', '/metas');
    await expect(page.getByText(/metas cadastradas/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nova meta' })).toHaveCount(0);
  });
});
