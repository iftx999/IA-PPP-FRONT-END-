import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { entrar } from './login';

/** Marco 6: OCR de contrato digitalizado (ADR 0021), exportação do painel (B6) e histórico de metas (A5). */
const DIGITALIZADO = join(__dirname, 'exemplos', 'contrato-digitalizado.pdf');

test.describe('Refino (Marco 6)', () => {
  test('contrato digitalizado passa pelo OCR e o texto vira página consultável', async ({ page }) => {
    test.setTimeout(120_000);
    await entrar(page, 'admin@exemplo.dev', '/contratos');
    const numero = `E2E-OCR-${Date.now()}`;
    await page.getByRole('button', { name: 'Novo contrato' }).click();
    const novo = page.getByRole('dialog', { name: 'Novo contrato' });
    await novo.getByLabel('Número').fill(numero);
    await novo.getByLabel('Unidade coberta').fill('concessao a');
    await page.getByRole('option', { name: 'Concessão A', exact: true }).click();
    await novo.getByRole('button', { name: 'Criar contrato' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(numero);

    await page.getByLabel('Arquivo PDF do contrato').setInputFiles(DIGITALIZADO);
    const documento = page.locator('li.documento').filter({ hasText: 'contrato-digitalizado.pdf' });
    // Com o Tesseract no ambiente, a página é reconhecida (sem ele, ficaria "sem texto").
    await expect(documento).toContainText('Pronto', { timeout: 60_000 });
    await expect(documento).toContainText('texto por OCR');
    await page.screenshot({ path: 'e2e/capturas/contrato-ocr.png' });
  });

  test('exporta o painel em CSV com os números da tela', async ({ page }) => {
    await entrar(page, 'diretoria@exemplo.dev', '/painel');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Exportar' }).click();
    await expect(page.getByText('A emissão fica registrada na auditoria.')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /Planilha CSV/ }).click();
    const arquivo = await download;
    expect(arquivo.suggestedFilename()).toMatch(/^painel-.+-\d{4}-\d{2}\.csv$/);
    const linhas = readFileSync((await arquivo.path())!, 'utf-8').split('\r\n').filter(Boolean);
    expect(linhas[0]).toContain('unidade;tipo;competencia;adesao_pct;ligados;com_rede');
    expect(linhas.length).toBeGreaterThan(1);
  });

  test('histórico de metas da unidade abre para quem só lê', async ({ page }) => {
    await entrar(page, 'diretoria@exemplo.dev', '/metas');
    await page.getByRole('button', { name: /Histórico de metas de Concessão A/ }).click();
    const dialogo = page.getByRole('dialog', { name: /Histórico de metas · Concessão A/ });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText(/alterada por aditivo|Versões anteriores/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Definir meta própria/ })).toHaveCount(0);
  });
});
