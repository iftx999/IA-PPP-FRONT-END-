import { expect, test } from '@playwright/test';
import { entrar } from './login';

const EQUIPE = 'Equipe E2E Centro';

/**
 * ADR 0036: equipe, campanha a partir de um setor com prévia e impacto na meta, envio à equipe, resultado em "Minhas OS"
 * e cancelamento (que libera os imóveis para a próxima execução).
 */
test.describe('Campanhas de ligação', () => {
  test('da equipe ao resultado de campo', async ({ page }) => {
    test.setTimeout(120_000);
    await entrar(page, 'admin@exemplo.dev', '/equipes');

    // Equipe própria no município, com a própria administradora (que também executa OS).
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Equipes de campo');
    // Espera a lista (ou o aviso de vazia) antes de decidir se a equipe já existe.
    await expect(page.locator('.lista, .vazio').first()).toBeVisible();
    if (!(await page.getByRole('button', { name: new RegExp(EQUIPE) }).isVisible())) {
      await page.getByRole('button', { name: 'Nova equipe' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Nova equipe' });
      await dialogo.getByLabel('Nome').fill(EQUIPE);
      await dialogo.getByLabel('Onde atua').fill('Cidade A');
      await page.getByRole('option', { name: 'Cidade A', exact: true }).click();
      await dialogo.getByLabel('Adicionar pessoa').fill('admin');
      await page.getByRole('option', { name: /admin@exemplo\.dev/ }).click();
      await dialogo.getByRole('button', { name: 'Salvar' }).click();
      await expect(dialogo).toBeHidden();
    }
    await expect(page.getByRole('button', { name: new RegExp(EQUIPE) })).toBeVisible();

    // Campanha por setor, só cortados: a prévia mostra quantas OS e o impacto na meta.
    await page.getByRole('link', { name: '← Campanhas' }).click();
    await page.getByRole('button', { name: 'Nova campanha' }).click();
    const nova = page.getByRole('dialog', { name: 'Nova campanha' });
    await nova.getByRole('radio', { name: 'Setor comercial' }).click();
    await nova.getByLabel('Setor comercial').fill('Centro');
    await page.getByRole('option', { name: 'Cidade A Centro' }).click();
    await nova.getByRole('radio', { name: 'Só cortados' }).click();
    const previa = nova.getByRole('region', { name: 'Prévia da campanha' });
    await expect(previa.getByText('OS a criar')).toBeVisible();
    await expect(previa.getByText(/a adesão de Cidade A Centro vai de/)).toBeVisible();
    await nova.getByLabel('Nome da campanha').fill(`Religação Centro E2E ${Date.now()}`);
    await nova.getByRole('button', { name: /^Criar \d+ OS$/ }).click();

    // Painel da campanha: envia 2 OS à equipe.
    await expect(page).toHaveURL(/\/campanhas\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { name: 'Funil' })).toBeVisible();
    await page.getByRole('button', { name: 'Enviar à equipe' }).click();
    const envio = page.getByRole('dialog', { name: 'Enviar à equipe' });
    await envio.getByLabel('Equipe').click();
    await page.getByRole('option', { name: new RegExp(EQUIPE) }).click();
    await envio.getByLabel('Quantas (opcional)').fill('2');
    await envio.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('2 OS enviadas.')).toBeVisible();
    const painel = page.url();
    await page.screenshot({ path: 'e2e/capturas/campanha.png', fullPage: true });

    // Minhas OS: registra uma recusa com motivo.
    await page.goto('/minhas-ordens');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Minhas OS');
    await page.getByRole('button', { name: 'Registrar resultado' }).first().click();
    const resultado = page.getByRole('dialog', { name: /OS \d+ · Religação/ });
    await resultado.getByRole('radio', { name: 'Recusada pelo morador' }).click();
    await resultado.getByRole('button', { name: 'Registrar' }).click();
    await expect(resultado.getByText('Escolha o motivo.')).toBeVisible();
    await resultado.getByLabel('Motivo').click();
    await page.getByRole('option', { name: 'Sem interesse' }).click();
    await resultado.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText(/OS \d+: recusada\./)).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/minhas-ordens.png', fullPage: true });

    // De volta ao painel: o motivo aparece; cancelar libera os imóveis.
    await page.goto(painel);
    await expect(page.getByRole('heading', { name: 'Motivos de recusa e inviabilidade' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar campanha' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Campanha cancelada.')).toBeVisible();
    await expect(page.locator('aurora-selo', { hasText: 'Cancelada' }).first()).toBeVisible();
  });
});
