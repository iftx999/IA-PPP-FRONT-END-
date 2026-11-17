import { expect, test } from '@playwright/test';
import { entrar } from './login';

/**
 * ADR 0042 (J1, J2): catálogo inicial, cadastro de serviço com parâmetro condicional (testado na pré-visualização do
 * app), nova versão só quando a definição muda, histórico de versões e motivos.
 */
test.describe('Catálogo de serviços', () => {
  test('do catálogo inicial ao serviço versionado', async ({ page }) => {
    test.setTimeout(120_000);
    await entrar(page, 'admin@exemplo.dev', '/servicos');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo de serviços');
    await expect(page.getByRole('heading', { name: /^Manutenção de rede/ })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar serviço' }).fill('limpeza');
    await expect(page.getByRole('link', { name: /Limpeza de rede/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Ligação nova/ })).toBeHidden();
    await page.screenshot({ path: 'e2e/capturas/catalogo.png', fullPage: true });

    // Novo serviço com um parâmetro que só aparece quando o anterior é "Não".
    const nome = `Troca de tampa E2E ${Date.now()}`;
    await page.getByRole('link', { name: 'Novo serviço' }).click();
    await expect(page).toHaveURL(/\/servicos\/novo/);
    await page.getByLabel('Nome', { exact: true }).fill(nome);
    await page.getByLabel('Grupo').click();
    await page.getByRole('option', { name: 'Manutenção de rede' }).click();
    await page.getByLabel('Onde acontece').click();
    await page.getByRole('option', { name: 'Trecho de logradouro' }).click();

    await page.getByRole('button', { name: 'Parâmetro' }).click();
    await page.getByLabel('Rótulo').last().fill('Tampa trocada');
    await page.getByLabel('Rótulo').last().blur();
    await expect(page.getByLabel('Chave').last()).toHaveValue('tampa_trocada');

    await page.getByRole('button', { name: 'Parâmetro' }).click();
    await page.getByLabel('Rótulo').last().fill('Por que não');
    await page.getByLabel('Rótulo').last().blur();
    await page.getByLabel('Tipo', { exact: true }).last().click();
    await page.getByRole('option', { name: 'Texto' }).click();
    await page.getByLabel('Mostrar só quando').click();
    await page.getByRole('option', { name: 'Tampa trocada' }).click();
    await page.getByLabel('For igual a').click();
    await page.getByRole('option', { name: 'Não' }).click();

    // Pré-visualização: o campo condicional só aparece com "Não".
    const app = page.getByRole('region', { name: 'Como aparece no app' });
    await expect(app.getByText(/^Por que não/)).toBeHidden();
    await app.getByRole('radio', { name: 'Não' }).click();
    await expect(app.getByText(/^Por que não/)).toBeVisible();

    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Serviço salvo · versão 1')).toBeVisible();
    await expect(page).toHaveURL(/\/servicos\/[0-9a-f-]{36}/);
    await page.screenshot({ path: 'e2e/capturas/servico.png', fullPage: true });

    // Mesma definição: continua na versão 1. Tempo diferente: versão 2.
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Serviço salvo (definição igual: mesma versão)')).toBeVisible();
    await page.getByLabel('Tempo padrão').fill('45');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Serviço salvo · versão 2')).toBeVisible();
    const versoes = page.getByRole('region', { name: 'Versões' });
    await expect(versoes.getByRole('button', { name: /^Versão/ })).toHaveCount(2);
    await versoes.getByRole('button', { name: /^Versão 1/ }).click();
    await expect(page.getByRole('dialog', { name: 'Versão 1' }).getByText('30 min')).toBeVisible();
    await page.getByRole('button', { name: 'Fechar' }).click();

    // Motivos: "Outro" exige observação.
    await page.getByRole('link', { name: '← Catálogo de serviços' }).click();
    await page.getByRole('tab', { name: 'Motivos' }).click();
    await expect(page).toHaveURL(/aba=motivos/);
    const devolucao = page.getByRole('region', { name: 'Devolução' });
    await expect(devolucao.getByRole('button', { name: /Endereço não encontrado/ })).toBeVisible();
    await expect(devolucao.getByRole('button', { name: /Outro.*Exige observação/ })).toBeVisible();
  });
});
