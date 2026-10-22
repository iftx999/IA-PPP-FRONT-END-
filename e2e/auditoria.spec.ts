import { expect, test } from '@playwright/test';
import { entrar } from './login';

test.describe('Auditoria', () => {
  // No banco herdado a trilha é do perfil Auditor (o administrador não a consulta): segregação de funções.
  test('trilha com filtros, detalhes e verificação', async ({ page }) => {
    await entrar(page, 'auditoria@exemplo.dev', '/admin/auditoria');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Auditoria');
    const lista = page.getByRole('region', { name: 'Eventos da trilha' });
    await expect(lista.getByRole('row').nth(1)).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/auditoria.png', fullPage: true });

    // Filtro por tipo: só unidades criadas.
    await page.getByRole('combobox', { name: 'Eventos' }).click();
    await page.getByRole('option', { name: 'Unidade criada' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page).toHaveURL(/\/admin\/auditoria$/);
    const linhas = lista.locator('tr.evento');
    await expect(linhas.first()).toContainText('Unidade criada');
    expect(await linhas.filter({ hasNotText: 'Unidade criada' }).count()).toBe(0);

    // Detalhes do evento.
    await linhas.first().getByRole('button', { name: /^Ver detalhes/ }).click();
    await expect(lista.locator('tr.detalhe')).toContainText('nº na trilha');
    await page.screenshot({ path: 'e2e/capturas/auditoria-detalhe.png' });

    // Verificação da cadeia.
    await page.getByRole('button', { name: 'Verificar integridade' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Trilha (íntegra|adulterada)/ })).toBeVisible();

    // O Auditor não tem permissão de exportação (a exportação é coberta nos testes da API).
    await expect(page.getByRole('button', { name: 'Exportar CSV' })).toHaveCount(0);
  });

  test('perfil sem auditoria não acessa', async ({ page }) => {
    await entrar(page, 'comercial.cidadea@exemplo.dev', '/admin/auditoria');
    await expect(page.getByText('Seu perfil não permite consultar a auditoria.')).toBeVisible();
  });
});
