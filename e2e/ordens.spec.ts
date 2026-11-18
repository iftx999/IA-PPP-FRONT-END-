import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { entrar } from './login';

const EQUIPE = 'Equipe E2E Centro';
const RUA = 'Rua das Palmeiras E2E';

/**
 * ADR 0044 (J4, J5): lote por logradouro com prévia (a partir do detalhe da rua), programação das OS para a equipe,
 * devolução em "Minhas OS", cancelamento e encerramento pelo programador. Termina com todas as OS do lote fechadas,
 * para o teste poder rodar de novo. Depende de logradouros.spec.ts (rua importada) e campanhas.spec.ts (equipe).
 */
test.describe('Programação de OS', () => {
  test('do lote na rua à devolução e ao cancelamento', async ({ page }) => {
    test.setTimeout(150_000);
    await entrar(page, 'admin@exemplo.dev', '/logradouros?busca=palmeiras%20e2e');
    await page.getByRole('link', { name: RUA }).click();
    await page.getByRole('link', { name: 'Lote de OS na rua' }).click();

    // Nova OS já no modo lote, com a rua escolhida: prévia antes de gerar.
    await expect(page).toHaveURL(/\/ordens/);
    const nova = page.getByRole('dialog', { name: 'Nova OS' });
    await expect(nova.getByLabel('Logradouro')).toHaveValue(RUA);
    await nova.getByLabel('Serviço').click();
    await page.getByRole('option', { name: /Verificação de lançamento irregular/ }).click();
    await nova.getByLabel('Prioridade').click();
    await page.getByRole('option', { name: 'Alta' }).click();
    await expect(nova.getByText(/Prazo: 3 dias úteis/)).toBeVisible();
    await nova.getByRole('button', { name: 'Ver prévia' }).click();
    const previa = nova.getByRole('definition').last();
    await expect(previa).toHaveText('3');
    await nova.getByLabel('Instruções para a equipe (opcional)').fill('Verificar caixa de gordura');
    await nova.getByRole('button', { name: 'Gerar 3 OS' }).click();
    await expect(nova.getByText('3 OS criadas')).toBeVisible();
    await nova.getByRole('button', { name: 'Concluir' }).click();

    // A lista mostra o lote, na ordem da numeração; programa as duas primeiras para hoje.
    await expect(page.getByText('Mostrando as OS de um lote.')).toBeVisible();
    const linhas = page.getByRole('region', { name: 'Ordens de serviço' }).locator('tbody tr');
    await expect(linhas).toHaveCount(3);
    await expect(linhas.first()).toContainText('Lote por logradouro');
    await linhas.nth(0).getByRole('checkbox').check();
    await linhas.nth(1).getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Programar 2' }).click();
    const programar = page.getByRole('dialog', { name: 'Programar 2 OS' });
    await programar.getByLabel('Equipe').click();
    await page.getByRole('option', { name: new RegExp(EQUIPE) }).click();
    await programar.getByRole('button', { name: 'Programar' }).click();
    await expect(page.getByText('2 OS programadas.')).toBeVisible();
    await expect(linhas.nth(0)).toContainText('Programada');
    await page.screenshot({ path: 'e2e/capturas/ordens.png', fullPage: true });

    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const graves = axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(graves).toEqual([]);

    // Minhas OS: a equipe devolve uma delas (endereço não encontrado).
    const lote = page.url();
    await page.goto('/minhas-ordens');
    const cartao = page
      .getByRole('listitem')
      .filter({ hasText: 'Verificação de lançamento irregular' })
      .filter({ hasText: 'Verificar caixa de gordura' })
      .first();
    await cartao.getByRole('button', { name: 'Devolver' }).click();
    const devolver = page.getByRole('dialog', { name: /Devolver OS \d+/ });
    await devolver.getByLabel('Motivo').click();
    await page.getByRole('option', { name: 'Endereço não encontrado' }).click();
    await devolver.getByLabel(/Observação/).fill('Numeração apagada');
    await devolver.getByRole('button', { name: 'Devolver' }).click();
    await expect(page.getByText(/OS \d+: devolvida\./)).toBeVisible();

    // De volta à programação: encerra a programada e cancela a devolvida e a planejada.
    await page.goto(lote);
    await expect(linhas).toHaveCount(3);
    const devolvida = linhas.filter({ hasText: 'Devolvida' });
    await expect(devolvida).toContainText('Endereço não encontrado');
    await linhas
      .filter({ hasText: 'Programada' })
      .getByRole('button', { name: 'Encerrar' })
      .click();
    const encerrar = page.getByRole('dialog', { name: /Encerrar OS \d+/ });
    await encerrar.getByRole('button', { name: 'Encerrar' }).click();
    await expect(page.getByText(/OS \d+: encerrada\./)).toBeVisible();
    for (const situacao of ['Devolvida', 'Planejada']) {
      await linhas.filter({ hasText: situacao }).getByRole('button', { name: 'Cancelar' }).click();
      const cancelar = page.getByRole('dialog', { name: /Cancelar OS \d+/ });
      await cancelar.getByLabel('Motivo').click();
      await page.getByRole('option', { name: 'OS duplicada' }).click();
      await cancelar.getByRole('button', { name: 'Cancelar OS' }).click();
      await expect(cancelar).toBeHidden();
    }
    await expect(linhas.filter({ hasText: 'Cancelada' })).toHaveCount(2);
    await expect(linhas.filter({ hasText: 'Encerrada' })).toHaveCount(1);
  });
});
