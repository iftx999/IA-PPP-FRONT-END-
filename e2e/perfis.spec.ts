import { expect, test } from '@playwright/test';
import { entrar } from './login';

test.describe('Perfis', () => {
  test('matriz, perfil do sistema somente leitura e ciclo criar → editar → remover', async ({ page }) => {
    await entrar(page, 'admin@exemplo.dev', '/admin/perfis');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Perfis');
    const matriz = page.getByRole('table');
    await expect(matriz.getByRole('columnheader', { name: /Administrador do tenant/ })).toBeVisible();
    await expect(matriz.getByRole('rowheader', { name: 'Usuários e perfis' })).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/perfis.png', fullPage: true });

    // Perfil do sistema abre só para leitura e oferece duplicar.
    await page.getByRole('button', { name: 'Ações do perfil Administrador do tenant', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Ver detalhes' }).click();
    const detalhes = page.getByRole('dialog', { name: 'Administrador do tenant' });
    await expect(detalhes.getByText('Perfil do sistema: não pode ser alterado.')).toBeVisible();
    await detalhes.getByRole('button', { name: 'Duplicar' }).click();

    const nome = `Teste E2E ${Date.now()}`;
    const novo = page.getByRole('dialog', { name: 'Novo perfil' });
    await expect(novo.getByLabel('Nome')).toHaveValue('Cópia de Administrador do tenant');
    await novo.getByLabel('Nome').fill(nome);
    await novo.getByRole('button', { name: 'Salvar perfil' }).click();
    await expect(novo).toBeHidden();
    await expect(matriz.getByRole('columnheader', { name: new RegExp(nome) })).toBeVisible();

    // Edição: desmarcar a área inteira de Unidades.
    await page.getByRole('button', { name: `Ações do perfil ${nome}` }).click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    const edicao = page.getByRole('dialog', { name: 'Editar perfil' });
    await page.screenshot({ path: 'e2e/capturas/perfis-editor.png' });
    await edicao.getByRole('group', { name: 'Unidades' }).getByRole('checkbox', { name: 'Unidades', exact: true }).uncheck();
    await expect(edicao.getByRole('checkbox', { name: /Consultar unidades/ })).not.toBeChecked();
    await edicao.getByRole('button', { name: 'Salvar perfil' }).click();
    await expect(edicao).toBeHidden();

    await page.getByRole('button', { name: `Ações do perfil ${nome}` }).click();
    await page.getByRole('menuitem', { name: 'Remover' }).click();
    const remocao = page.getByRole('dialog', { name: `Remover ${nome}` });
    await remocao.getByRole('button', { name: 'Remover' }).click();
    await expect(remocao).toBeHidden();
    await expect(matriz.getByRole('columnheader', { name: new RegExp(nome) })).toHaveCount(0);
  });

  test('perfil sem gestão de usuários não acessa', async ({ page }) => {
    await entrar(page, 'diretoria@exemplo.dev', '/admin/perfis');
    await expect(page.getByText('Seu perfil não permite gerenciar perfis e permissões.')).toBeVisible();
  });
});
