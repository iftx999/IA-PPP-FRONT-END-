import { expect, test, type Page } from '@playwright/test';
import { entrar } from './login';

const PENALIDADE = 'Abrir item Multa por adesão abaixo da meta';

async function abrirPenalidade(page: Page) {
  await page.goto('/contratos');
  await page.getByRole('link', { name: /001\/2025/ }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('001/2025');
  await page.getByRole('region', { name: 'Itens do contrato' }).getByRole('button', { name: PENALIDADE }).click();
  const dialogo = page.getByRole('dialog', { name: /Item/ });
  const regra = dialogo.getByRole('region', { name: 'Cálculo da multa' });
  await expect(regra).toBeVisible();
  return { dialogo, regra };
}

/** ADR 0035: penalidade aprovada vira regra calculável e o simulador estima a multa. */
test.describe('Simulador de penalidades', () => {
  test('define o cálculo da multa, simula ritmos e remove', async ({ page }) => {
    test.setTimeout(90_000);
    await entrar(page, 'admin@exemplo.dev', '/contratos');
    let { dialogo, regra } = await abrirPenalidade(page);

    // Execução anterior interrompida: começa do zero.
    if (await regra.getByRole('button', { name: 'Remover' }).isVisible()) {
      await regra.getByRole('button', { name: 'Remover' }).click();
      await regra.getByRole('button', { name: 'Confirmar remoção' }).click();
    }
    await expect(regra.getByText('Sem regra de cálculo')).toBeVisible();

    // O formulário vem sugerido do item aprovado (0,1 e "%"); a base em reais é informada.
    await regra.getByRole('button', { name: 'Definir cálculo' }).click();
    await expect(regra.getByRole('radio', { name: '% de uma base por ponto' })).toBeChecked();
    await expect(regra.getByLabel('Percentual por ponto')).toHaveValue('0.1');
    await regra.getByRole('button', { name: 'Salvar cálculo' }).click();
    await expect(regra.getByText('Informe a base em reais.')).toBeVisible();
    await regra.getByLabel('Base', { exact: true }).fill('10000000');
    await regra.getByRole('button', { name: 'Salvar cálculo' }).click();
    await expect(regra.getByText(/0,1% de R\$\s10\.000\.000,00 \(faturamento mensal\)/)).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/regra-penalidade.png' });

    // Simular abre na unidade onde a multa é aferida.
    await regra.getByRole('link', { name: 'Simular' }).click();
    await expect(page).toHaveURL(/\/simulador\?unidade=/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Concessão A');
    const regras = page.getByRole('region', { name: 'Penalidades consideradas' });
    await expect(regras.getByText('Multa por adesão abaixo da meta')).toBeVisible();
    await expect(page.locator('aurora-grafico-simulacao svg')).toBeVisible();

    // Sem novas ligações a meta não sai e a multa aparece; no ritmo para a meta, some.
    await page.getByRole('spinbutton', { name: 'Ligações por mês (número)' }).fill('0');
    await page.getByRole('spinbutton', { name: 'Ligações por mês (número)' }).press('Enter');
    await expect(page).toHaveURL(/ligacoes=0/);
    const resultado = page.getByRole('region', { name: 'Resultado' });
    await expect(resultado.getByText(/a meta não sai/)).toBeVisible();
    await expect(resultado.getByText(/a mais que no ritmo atual/)).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/simulador-sem-ligacoes.png', fullPage: true });

    await page.getByRole('button', { name: /Para a meta no prazo/ }).click();
    await expect(resultado.getByText(/sai até o prazo/)).toBeVisible();
    await expect(resultado.locator('.numero-heroi')).toHaveText(/R\$\s0,00/);

    await page.getByRole('radio', { name: 'Mês a mês' }).click();
    await expect(page.getByRole('cell', { name: /aferição/ }).first()).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/simulador-mes-a-mes.png', fullPage: true });

    // Remover tira a penalidade do simulador.
    ({ dialogo, regra } = await abrirPenalidade(page));
    await regra.getByRole('button', { name: 'Remover' }).click();
    await regra.getByRole('button', { name: 'Confirmar remoção' }).click();
    await expect(regra.getByText('Sem regra de cálculo')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Fechar' }).click();
  });

  test('o painel leva ao simulador da unidade', async ({ page }) => {
    await entrar(page, 'diretoria@exemplo.dev');
    await page.getByRole('link', { name: /Simular ritmos e penalidades/ }).click();
    await expect(page).toHaveURL(/\/simulador\?unidade=/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Concessão A');
    await expect(page.getByText('Estimativa', { exact: true })).toBeVisible();
  });
});
