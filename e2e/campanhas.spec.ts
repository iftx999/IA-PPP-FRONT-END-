import { expect, test } from '@playwright/test';
import { entrar } from './login';

const EQUIPE = 'Equipe E2E Centro';

/**
 * ADR 0036, 0044: equipe, campanha a partir de um setor com prévia e impacto na meta, programação para a equipe,
 * encerramento como não executada em "Minhas OS" e cancelamento (que libera os imóveis para a próxima execução).
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

    // Operação (RN-23, ADR 0046): caminhão de vácuo (atende moto, carro e vácuo) e todas as habilidades, para
    // receber as OS de qualquer serviço dos testes; base no centro da Cidade A.
    await page.getByRole('button', { name: new RegExp(EQUIPE) }).click();
    const edicao = page.getByRole('dialog', { name: 'Editar equipe' });
    await edicao.getByLabel('Veículo').click();
    await page.getByRole('option', { name: 'Caminhão de vácuo' }).click();
    await edicao.getByLabel('Habilidades').click();
    for (const opcao of await page.getByRole('option').all()) {
      if ((await opcao.getAttribute('aria-selected')) !== 'true') {
        await opcao.click();
      }
    }
    await page.keyboard.press('Escape');
    await edicao.getByRole('application', { name: /Base da equipe/ }).click();
    await expect(edicao.getByText('Nenhum ponto marcado')).toBeHidden();
    await page.screenshot({ path: 'e2e/capturas/equipe-operacao.png' });
    await edicao.getByRole('button', { name: 'Salvar' }).click();
    await expect(edicao).toBeHidden();
    await expect(page.getByRole('button', { name: new RegExp(EQUIPE) })).toContainText(
      'Caminhão de vácuo',
    );

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

    // Painel da campanha: programa 2 OS para a equipe (hoje).
    await expect(page).toHaveURL(/\/campanhas\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { name: 'Funil' })).toBeVisible();
    await page.getByRole('button', { name: 'Programar para a equipe' }).click();
    const envio = page.getByRole('dialog', { name: 'Programar para a equipe' });
    await envio.getByLabel('Equipe').click();
    await page.getByRole('option', { name: new RegExp(EQUIPE) }).click();
    await envio.getByLabel('Quantas (opcional)').fill('2');
    await envio.getByRole('button', { name: 'Programar' }).click();
    await expect(page.getByText('2 OS programadas.')).toBeVisible();
    const painel = page.url();
    await page.screenshot({ path: 'e2e/capturas/campanha.png', fullPage: true });

    // Minhas OS: encerra uma como não executada, com motivo do catálogo.
    await page.goto('/minhas-ordens');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Minhas OS');
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Religação' })
      .getByRole('button', { name: 'Encerrar' })
      .first()
      .click();
    const resultado = page.getByRole('dialog', { name: /Encerrar OS \d+ · Religação/ });
    await resultado.getByRole('radio', { name: 'Não executada' }).click();
    await resultado.getByRole('button', { name: 'Encerrar' }).click();
    await expect(resultado.getByText('Escolha o motivo.')).toBeVisible();
    await resultado.getByLabel('Motivo').click();
    await page.getByRole('option', { name: 'Morador sem interesse' }).click();
    await resultado.getByRole('button', { name: 'Encerrar' }).click();
    await expect(page.getByText(/OS \d+: encerrada\./)).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/minhas-ordens.png', fullPage: true });

    // De volta ao painel: o motivo aparece; cancelar libera os imóveis.
    await page.goto(painel);
    await expect(
      page.getByRole('heading', { name: 'Motivos de não execução e devolução' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar campanha' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Campanha cancelada.')).toBeVisible();
    await expect(page.locator('aurora-selo', { hasText: 'Cancelada' }).first()).toBeVisible();
  });
});
