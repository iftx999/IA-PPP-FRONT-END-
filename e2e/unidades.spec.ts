import { expect, test } from '@playwright/test';
import { entrar } from './login';

test.describe('Unidades', () => {
  test('árvore e ciclo criar → editar → mover → inativar', async ({ page }) => {
    await entrar(page, 'admin@exemplo.dev', '/admin/unidades');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Unidades');
    const arvore = page.getByRole('tree', { name: 'Unidades' });
    await expect(arvore.getByRole('treeitem', { name: /Cidade A Centro/ })).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/unidades.png', fullPage: true });

    // Busca mostra a unidade e os ancestrais.
    await page.getByLabel('Buscar unidade').fill('cascata');
    await expect(arvore.getByRole('treeitem')).toHaveCount(4);
    await page.getByLabel('Buscar unidade').fill('');

    // Criar um setor abaixo da Cidade C.
    const codigo = `E2E-${Date.now()}`;
    await arvore.getByRole('treeitem').filter({ has: page.locator('.nome', { hasText: /^Cidade C$/ }) }).click();
    await page.getByRole('button', { name: 'Nova unidade abaixo' }).click();
    const nova = page.getByRole('dialog', { name: 'Nova unidade' });
    await nova.getByLabel('Tipo').click();
    await page.getByRole('option', { name: 'Setor comercial' }).click();
    await nova.getByLabel('Nome').fill('Setor de Teste');
    await nova.getByLabel('Código').fill(codigo.toLowerCase());
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/capturas/unidades-nova.png' });
    await nova.getByRole('button', { name: 'Criar unidade' }).click();
    await expect(nova).toBeHidden();
    const detalhe = page.getByRole('region', { name: 'Detalhes da unidade' });
    await expect(detalhe.getByRole('heading', { name: 'Setor de Teste' })).toBeVisible();
    await expect(detalhe).toContainText(codigo);

    // Editar o nome.
    await detalhe.getByRole('button', { name: 'Editar' }).click();
    const edicao = page.getByRole('dialog', { name: /^Editar / });
    await edicao.getByLabel('Nome').fill('Setor de Teste Renomeado');
    await edicao.getByRole('button', { name: 'Salvar' }).click();
    await expect(edicao).toBeHidden();
    await expect(detalhe.getByRole('heading', { name: 'Setor de Teste Renomeado' })).toBeVisible();

    // Mover para a Cidade A.
    await detalhe.getByRole('button', { name: 'Mover' }).click();
    const mover = page.getByRole('dialog', { name: /^Mover / });
    await mover.getByLabel('Novo lugar (abaixo de)').fill('cidade a');
    await page.getByRole('option', { name: 'Concessão A › Cidade A', exact: true }).click();
    await page.screenshot({ path: 'e2e/capturas/unidades-mover.png' });
    await mover.getByRole('button', { name: 'Mover' }).click();
    await expect(mover).toBeHidden();
    await expect(detalhe).toContainText('Concessão A › Cidade A › Setor de Teste Renomeado');

    // Inativar: aparece como inativa (a lista passa a mostrar inativas).
    await detalhe.getByRole('button', { name: 'Inativar' }).click();
    const inativar = page.getByRole('dialog', { name: /^Inativar / });
    await inativar.getByRole('button', { name: 'Inativar' }).click();
    await expect(inativar).toBeHidden();
    await expect(arvore.getByRole('treeitem', { name: new RegExp(codigo) })).toContainText('Inativa');
  });

  test('não inativa unidade com unidades ativas abaixo', async ({ page }) => {
    await entrar(page, 'admin@exemplo.dev', '/admin/unidades');
    await page.getByRole('tree').getByRole('treeitem').filter({ has: page.locator('.nome', { hasText: /^Cidade B$/ }) }).click();
    await page.getByRole('region', { name: 'Detalhes da unidade' }).getByRole('button', { name: 'Inativar' }).click();
    const inativar = page.getByRole('dialog', { name: /^Inativar / });
    await inativar.getByRole('button', { name: 'Inativar' }).click();
    await expect(inativar.getByRole('alert')).toContainText('abaixo desta');
  });

  test('perfil sem gestão de unidades não acessa', async ({ page }) => {
    await entrar(page, 'diretoria@exemplo.dev', '/admin/unidades');
    await expect(page.getByText('Seu perfil não permite gerenciar unidades.')).toBeVisible();
  });
});
