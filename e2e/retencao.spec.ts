import { expect, test } from '@playwright/test';
import { entrar } from './login';

/**
 * Retenção da trilha (doc 08, 8.7; ADR 0029): quem gere usuários define o prazo (política do cliente); o Auditor só
 * consulta. Volta ao padrão no fim para não afetar os outros testes.
 */
test.describe('Retenção da auditoria', () => {
  test('administrador altera o prazo e o auditor vê o novo prazo', async ({ page, browser }) => {
    await entrar(page, 'admin@exemplo.dev', '/admin/usuarios');
    const politica = page.getByRole('region', { name: 'Retenção da auditoria' });
    await expect(politica).toContainText('60 meses (5 anos)');

    await politica.getByRole('button', { name: 'Alterar prazo' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Retenção da auditoria' });
    const campo = dialogo.getByLabel('Prazo em meses');
    await campo.fill('6');
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialogo.getByText('Informe um prazo entre 12 e 240 meses.')).toBeVisible();

    await campo.fill('24');
    await expect(dialogo.getByRole('alert').filter({ hasText: 'Reduzir o prazo apaga' })).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/retencao-dialogo.png' });
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialogo).toBeHidden();
    await expect(politica).toContainText('24 meses (2 anos)');

    const outro = await browser.newContext();
    const auditor = await outro.newPage();
    await entrar(auditor, 'auditoria@exemplo.dev', '/admin/auditoria');
    await auditor.getByRole('button', { name: 'Retenção' }).click();
    await expect(auditor.getByRole('dialog', { name: 'Retenção da trilha' })).toContainText('24 meses (2 anos)');
    await expect(auditor.getByRole('dialog').getByRole('button', { name: 'Salvar' })).toHaveCount(0);
    await outro.close();

    // Volta ao padrão.
    await politica.getByRole('button', { name: 'Alterar prazo' }).click();
    await dialogo.getByLabel('Prazo em meses').fill('60');
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(politica).toContainText('60 meses (5 anos)');
  });
});
