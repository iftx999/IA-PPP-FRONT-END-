import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { entrar } from './login';

/** Bairro da Cidade A com imóveis e rede no banco de desenvolvimento. */
const PONTO = { lon: -47.3972, lat: -22.5511 };

async function mapaCarregado(page: Page): Promise<void> {
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  // Tiles e camadas leves chegaram: o MapLibre para de pedir e a rede fica ociosa.
  await page.waitForLoadState('networkidle');
}

async function clicarNoCentro(page: Page): Promise<void> {
  const caixa = (await page.locator('.maplibregl-canvas').boundingBox())!;
  await page.mouse.click(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
}

/** Clica no imóvel do centro; repete enquanto os ícones ainda não foram desenhados (tiles chegando). */
async function clicarNoImovelDoCentro(page: Page): Promise<void> {
  await expect(async () => {
    const consulta = page.waitForResponse((r) => r.url().includes('/api/v1/mapa/imoveis?'), { timeout: 2_000 });
    await clicarNoCentro(page);
    expect((await consulta).status()).toBe(200);
  }).toPass({ timeout: 30_000 });
}

test.describe('Mapa (épico E)', () => {
  test('camadas por situação, agrupamentos e vista 3D', async ({ page }) => {
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(e.message));
    const tiles: number[] = [];
    page.on('response', (r) => r.url().includes('/api/v1/mapa/tiles/') && tiles.push(r.status()));

    await entrar(page, 'admin@exemplo.dev', '/mapa');
    await expect(page.getByRole('heading', { name: 'Mapa', level: 1 })).toBeVisible();
    await mapaCarregado(page);
    await expect(page.getByRole('combobox', { name: 'Competência' })).toContainText(/de 20\d\d/);
    await expect(page.getByText('Aproxime para ver cada imóvel.')).toBeVisible();
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((s) => s === 200 || s === 204)).toBe(true);
    await page.screenshot({ path: 'e2e/capturas/mapa.png' });

    // Desligar uma situação muda a URL dos tiles (o servidor filtra).
    const pedidoFiltrado = page.waitForRequest((r) => r.url().includes('/mapa/tiles/') && !r.url().includes('CORTADO'));
    await page.getByRole('checkbox', { name: 'Cortado' }).uncheck();
    await pedidoFiltrado;

    await page.getByRole('button', { name: 'Vista 3D' }).click();
    await expect(page.getByRole('button', { name: 'Vista de cima' })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'e2e/capturas/mapa-3d.png' });
    expect(erros).toEqual([]);
  });

  test('clique no imóvel lista matrícula e situação; link direto para o ponto', async ({ page }) => {
    await entrar(page, 'admin@exemplo.dev', '/mapa');
    await page.goto(`/mapa?lon=${PONTO.lon}&lat=${PONTO.lat}&zoom=17`);
    await mapaCarregado(page);
    await expect(page.getByText('Aproxime para ver cada imóvel.')).toBeHidden();

    await clicarNoImovelDoCentro(page);
    const detalhe = page.locator('.detalhe');
    await expect(detalhe.getByText('Imóveis neste ponto')).toBeVisible();
    // Administrador tem dados_pessoais:ler: matrícula completa (exibição auditada).
    await expect(detalhe.locator('.matricula').first()).toHaveText(/^\d{7}$/);
    await expect(detalhe.getByText('Localize no sistema comercial pela matrícula.')).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/mapa-imoveis.png' });
  });

  test('marcar local, Esc cancela, só quem criou remove', async ({ page }) => {
    await entrar(page, 'comercial.cidadea@exemplo.dev', '/mapa');
    await page.goto(`/mapa?lon=${PONTO.lon}&lat=${PONTO.lat}&zoom=16`);
    await mapaCarregado(page);
    await expect(page.getByRole('button', { name: 'Exportar área' })).toBeDisabled();

    await page.getByRole('button', { name: 'Marcar local' }).click();
    await expect(page.getByText('Clique no mapa onde quer marcar. Esc cancela.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Clique no mapa onde quer marcar. Esc cancela.')).toBeHidden();

    await page.getByRole('button', { name: 'Marcar local' }).click();
    await clicarNoCentro(page);
    const dialogo = page.getByRole('dialog', { name: 'Marcar local' });
    await expect(dialogo).toBeVisible();
    const titulo = `Visita E2E ${Date.now()}`;
    await dialogo.getByLabel('Título').fill(titulo);
    await dialogo.getByLabel('Observação (opcional)').fill('Rua sem caixa de inspeção.');
    await dialogo.getByRole('button', { name: 'Marcar' }).click();
    await expect(dialogo).toBeHidden();

    const detalhe = page.locator('.detalhe');
    await expect(detalhe.getByRole('heading', { name: titulo })).toBeVisible();
    await expect(detalhe.getByText('Rua sem caixa de inspeção.')).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/mapa-marcacao.png' });
    await detalhe.getByRole('button', { name: 'Remover' }).click();
    await expect(detalhe).toBeHidden();
  });

  test('exporta a área visível em CSV e PDF; diretoria vê matrícula mascarada', async ({ page }) => {
    await entrar(page, 'diretoria@exemplo.dev', '/mapa');
    await page.goto(`/mapa?lon=${PONTO.lon}&lat=${PONTO.lat}&zoom=16`);
    await mapaCarregado(page);
    await expect(page.getByRole('button', { name: 'Marcar local' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Exportar área' }).click();
    await expect(page.getByText('A emissão fica registrada na auditoria.')).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/mapa-exportar.png' });
    const csv = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /Planilha CSV/ }).click();
    const arquivo = await csv;
    expect(arquivo.suggestedFilename()).toMatch(/^area-do-mapa-\d{4}-\d{2}\.csv$/);
    const linhas = readFileSync((await arquivo.path())!, 'utf-8').split('\r\n');
    expect(linhas[0]).toContain('tipo;matricula;situacao;localizacao;unidade;latitude;longitude');
    expect(linhas[1]).toMatch(/^Imóvel;••••\d{3};/);

    await page.getByRole('button', { name: 'Exportar área' }).click();
    const pdf = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /PDF/ }).click();
    const documento = await pdf;
    expect(documento.suggestedFilename()).toMatch(/\.pdf$/);
    expect(readFileSync((await documento.path())!).subarray(0, 5).toString()).toBe('%PDF-');

    await clicarNoImovelDoCentro(page);
    await expect(page.locator('.detalhe .matricula').first()).toHaveText(/^••••\d{3}$/);
  });
});
