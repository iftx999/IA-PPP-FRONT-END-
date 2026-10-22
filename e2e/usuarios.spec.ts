import { expect, test } from '@playwright/test';
import { entrar } from './login';

test.describe('Usuários', () => {
  test('lista, filtros, editor de acesso e formulário de convite', async ({ page }) => {
    await entrar(page, 'admin@exemplo.dev', '/admin/usuarios');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Usuários');
    const lista = page.getByRole('table');
    const linhaComercial = lista.getByRole('row', { name: /comercial\.cidadea@exemplo\.dev/ });
    await expect(linhaComercial).toContainText('Gestor comercial');
    await expect(lista.getByRole('row', { name: /admin@exemplo\.dev/ })).toContainText('você');
    await page.screenshot({ path: 'e2e/capturas/usuarios.png', fullPage: true });

    // Filtros: busca sem acento e situação.
    await page.getByLabel('Buscar por nome ou e-mail').fill('comercial');
    await expect(lista.getByRole('row')).toHaveCount(2);
    await page.getByLabel('Buscar por nome ou e-mail').fill('');
    await page.getByRole('radio', { name: 'Convite pendente' }).click();
    await expect(lista.getByRole('row', { name: /comercial\.cidadea/ })).toHaveCount(0);
    await page.getByRole('radio', { name: 'Todos' }).click();

    // Editor de acesso: salvar sem mudanças é aceito e auditado.
    await page.getByRole('button', { name: /^Ações de .*/ }).nth(0).waitFor();
    await linhaComercial.getByRole('button', { name: /^Ações de / }).click();
    await page.getByRole('menuitem', { name: 'Editar acesso' }).click();
    const acesso = page.getByRole('dialog', { name: /^Acesso de / });
    await expect(acesso.getByRole('group', { name: 'Concessão 1' }).getByLabel('Unidade')).toHaveValue(/Cidade A/);
    await page.waitForTimeout(300); // fim da animação de abertura
    await page.screenshot({ path: 'e2e/capturas/usuarios-acesso.png' });
    await acesso.getByRole('button', { name: 'Salvar acesso' }).click();
    await expect(acesso).toBeHidden();
    await expect(page.locator('.mat-mdc-snack-bar-label').first()).toContainText(/Acesso de .* atualizado\./);

    // Convite: validações do formulário (o envio depende do Keycloak e é coberto nos testes da API).
    await page.getByRole('button', { name: 'Convidar usuário' }).click();
    const convite = page.getByRole('dialog', { name: 'Convidar usuário' });
    await convite.getByLabel('Nome completo').fill('Pessoa de Teste');
    await convite.getByLabel('E-mail').fill('nao-e-email');
    await convite.getByRole('button', { name: 'Enviar convite' }).click();
    await expect(convite.getByText('Informe um e-mail válido.')).toBeVisible();
    await expect(convite.getByText('Escolha um perfil.')).toBeVisible();
    await convite.getByLabel('E-mail').fill('pessoa.teste@exemplo.dev');
    await convite.getByLabel('Perfil').click();
    await page.getByRole('option', { name: 'Gestor comercial' }).click();
    await convite.getByLabel('Unidade').fill('cidade b');
    await page.getByRole('option', { name: 'Cidade B', exact: true }).click();
    await page.screenshot({ path: 'e2e/capturas/usuarios-convite.png' });
    await convite.getByRole('button', { name: 'Cancelar' }).click();
    await expect(convite).toBeHidden();
  });

  test('perfil sem gestão de usuários não acessa', async ({ page }) => {
    await entrar(page, 'diretoria@exemplo.dev', '/admin/usuarios');
    await expect(page.getByText('Seu perfil não permite gerenciar usuários.')).toBeVisible();
  });
});
