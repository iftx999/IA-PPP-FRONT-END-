import { expect, test } from '@playwright/test';
import { entrar } from './login';

test.describe('Operação', () => {
  test('alertas: verificar agora, sino, filtros e ir para a tela relacionada', async ({ page }) => {
    await entrar(page, 'admin@exemplo.dev', '/alertas');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Alertas');
    await page.getByRole('button', { name: 'Verificar agora' }).click();
    await expect(page.locator('.mat-mdc-snack-bar-label').first()).toContainText('Avaliação concluída');

    const lista = page.getByRole('list', { name: 'Alertas' });
    await expect(lista.getByRole('listitem').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^Alertas: \d+ pendentes$/ })).toBeVisible();
    await expect(page.getByRole('complementary')).toContainText(/Dados de [a-zç]+ de \d{4}/);
    await page.screenshot({ path: 'e2e/capturas/alertas.png', fullPage: true });

    await page.getByRole('radio', { name: 'Resolvidos' }).click();
    await page.getByRole('radio', { name: /Abertos/ }).click();
    const adesao = lista.getByRole('listitem').filter({ hasText: 'Adesão abaixo' }).first();
    await adesao.getByRole('link', { name: 'Ver' }).click();
    await expect(page).toHaveURL(/\/painel\?unidade=/);
  });

  test('integrações: cadastrar fonte, credencial do agente e histórico', async ({ page }) => {
    await entrar(page, 'admin@exemplo.dev', '/admin/integracoes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Integrações');
    await page.screenshot({ path: 'e2e/capturas/integracoes.png', fullPage: true });

    const nome = `Agente E2E ${Date.now()}`;
    await page.getByRole('button', { name: 'Nova fonte' }).click();
    let dialogo = page.getByRole('dialog', { name: 'Nova fonte' });
    await dialogo.getByLabel('Nome').fill(nome);
    await dialogo.getByLabel('Sistema de origem (opcional)').fill('Comercial XYZ');
    await dialogo.getByRole('spinbutton', { name: 'Atraso máximo' }).fill('36');
    await dialogo.getByRole('combobox', { name: 'Unidade do atraso' }).click();
    await page.getByRole('option', { name: 'horas' }).click();
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialogo).toBeHidden();
    const cartao = page.getByRole('listitem').filter({ hasText: nome });
    await expect(cartao).toContainText('36 horas');
    await expect(cartao).toContainText('Em dia');

    // Credencial: a chave aparece uma vez; depois, revogada.
    await cartao.getByRole('button', { name: `Ações da fonte ${nome}` }).click();
    await page.getByRole('menuitem', { name: 'Credenciais do agente' }).click();
    dialogo = page.getByRole('dialog', { name: /Credenciais do agente/ });
    await dialogo.getByRole('button', { name: 'Gerar credencial' }).click();
    await expect(dialogo.getByRole('status')).toContainText('Copie a chave agora');
    await expect(dialogo.locator('.chave-valor code')).toHaveText(/^aur_[a-z0-9]{10}\.[A-Za-z0-9_-]{43}$/);
    await page.screenshot({ path: 'e2e/capturas/integracoes-credencial.png' });
    await dialogo.getByRole('button', { name: 'Revogar' }).click();
    await expect(dialogo.getByText('Revogada')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Fechar' }).click();

    // Desativa a fonte de teste: inativa não gera alerta de atraso no banco de desenvolvimento.
    await cartao.getByRole('button', { name: `Ações da fonte ${nome}` }).click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    dialogo = page.getByRole('dialog', { name: /^Editar / });
    await dialogo.getByRole('switch').click();
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(cartao).toContainText('Inativa');

    // Histórico da fonte de demonstração.
    const demo = page.getByRole('listitem').filter({ hasText: 'Sistema comercial (demo)' });
    await demo.getByRole('button', { name: /^Ações da fonte/ }).click();
    await page.getByRole('menuitem', { name: 'Histórico de cargas' }).click();
    await expect(page.getByRole('dialog', { name: /Cargas de/ }).getByRole('row').nth(1)).toBeVisible();
  });
});
