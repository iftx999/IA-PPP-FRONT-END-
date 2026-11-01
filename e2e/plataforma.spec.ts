import { expect, test, type Page } from '@playwright/test';
import { informarCodigo } from './login';

const MAILPIT = process.env['AURORA_MAILPIT'] ?? 'http://localhost:8025';
const LOGO = 'e2e/exemplos/logo-exemplo.png';

/**
 * Administração da plataforma (S1, ADR 0027) contra o Keycloak local: o operador cria um cliente (realm novo de
 * verdade), a primeira administradora recebe o convite, cria a senha e entra pelo código da empresa. Cada execução cria
 * um cliente "Cliente E2E …" e o desativa no fim (o realm fica no Keycloak de desenvolvimento).
 */
async function entrarNaPlataforma(page: Page): Promise<void> {
  await page.goto('/plataforma');
  await page.waitForURL(/\/realms\/plataforma\//);
  await page.locator('#username').fill('plataforma@exemplo.dev');
  await page.locator('#password').fill('aurora-dev');
  await page.locator('#kc-login').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Clientes' })).toBeVisible();
}

async function linkDoConvite(page: Page, destinatario: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(async () => {
      const busca = await page.request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${destinatario}`)}`);
      const mensagens = ((await busca.json()) as { messages: { ID: string }[] }).messages;
      if (!mensagens.length) {
        return undefined;
      }
      const mensagem = await (await page.request.get(`${MAILPIT}/api/v1/message/${mensagens[0]!.ID}`)).json();
      link = /href="([^"]*action-token[^"]*)"/.exec((mensagem as { HTML: string }).HTML)?.[1]?.replaceAll('&amp;', '&');
      return link;
    }, { timeout: 20_000 })
    .toBeTruthy();
  return link!;
}

test.describe.serial('Administração da plataforma', () => {
  const sufixo = Date.now().toString(36);
  const nome = `Cliente E2E ${sufixo}`;
  const codigo = `cliente-e2e-${sufixo}`;
  const email = `admin.${sufixo}@cliente-e2e.exemplo.dev`;

  test('código de empresa desconhecido é explicado na entrada', async ({ page }) => {
    await page.goto('/painel');
    await page.waitForURL(/\/acesso/);
    await expect(page.getByRole('heading', { name: 'Entrar na Aurora' })).toBeVisible();
    await informarCodigo(page, 'nao-existe-e2e');
    await expect(page.getByRole('alert')).toContainText('Não encontramos uma empresa com o código “nao-existe-e2e”');
    await page.screenshot({ path: 'e2e/capturas/acesso.png' });
  });

  test('operador cria o cliente com limite e logo', async ({ page }) => {
    await entrarNaPlataforma(page);
    const tabela = page.getByRole('table', { name: 'Clientes' });
    await expect(tabela).toContainText('Grupo Saneamento Exemplo');

    await page.getByRole('button', { name: 'Novo cliente' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Novo cliente' });
    await dialogo.getByRole('button', { name: 'Criar cliente' }).click();
    await expect(dialogo.getByText('Informe o nome.').first()).toBeVisible();
    await dialogo.getByLabel('Nome do cliente').fill(nome);
    // O código é sugerido a partir do nome.
    await expect(dialogo.getByLabel('Código')).toHaveValue(codigo);
    await dialogo.getByLabel('Nome completo').fill('Ana E2E');
    await dialogo.getByLabel('E-mail').fill(email);
    await dialogo.getByRole('spinbutton', { name: 'Usuários ativos' }).fill('5');
    await dialogo.getByLabel('Nome do cliente').focus();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/capturas/plataforma-novo.png' });
    await dialogo.getByRole('button', { name: 'Criar cliente' }).click();
    await expect(dialogo).toBeHidden({ timeout: 60_000 });
    await expect(page.locator('.mat-mdc-snack-bar-label').first()).toContainText(`Cliente ${nome} criado`);

    const linha = tabela.getByRole('row', { name: new RegExp(codigo) });
    await expect(linha).toContainText('Ativo');
    await expect(linha).toContainText('1 de 5');

    await linha.getByRole('button', { name: `Ações de ${nome}` }).click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    const edicao = page.getByRole('dialog', { name: nome });
    await edicao.locator('input[type=file]').setInputFiles(LOGO);
    await expect(edicao.getByRole('img', { name: 'Logo atual' })).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/capturas/plataforma-edicao.png' });
    await edicao.getByRole('button', { name: 'Cancelar' }).click();
    await expect(edicao).toBeHidden();
    await page.screenshot({ path: 'e2e/capturas/plataforma.png', fullPage: true });
  });

  test('primeira administradora aceita o convite e entra pelo código, com a logo no menu', async ({ page }) => {
    await page.goto(await linkDoConvite(page, email));
    const prosseguir = page.getByRole('link', { name: /clique aqui|click here/i });
    if (await prosseguir.isVisible().catch(() => false)) {
      await prosseguir.click();
    }
    await page.locator('#password-new').fill('Senha-forte-123');
    await page.locator('#password-confirm').fill('Senha-forte-123');
    await page.locator('[type=submit]').click();
    // O link do convite volta com a empresa escolhida (?cliente=): não passa pela tela do código.
    const voltar = page.getByRole('link', { name: /voltar|back to application/i });
    const menu = page.getByRole('navigation', { name: 'Menu principal' });
    const usuario = page.locator('#username');
    await expect(menu.or(usuario).or(voltar)).toBeVisible({ timeout: 30_000 });
    if (await voltar.isVisible()) {
      await voltar.click();
      await expect(menu.or(usuario)).toBeVisible({ timeout: 20_000 });
    }
    if (await usuario.isVisible()) {
      expect(page.url()).toContain(`/realms/${codigo}/`);
      await usuario.fill(email);
      await page.locator('#password').fill('Senha-forte-123');
      await page.locator('#kc-login').click();
    }
    await expect(menu).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(nome).first()).toBeVisible();
    await expect(page.getByRole('img', { name: `Logo de ${nome}` })).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/plataforma-cliente-novo.png' });

    // Trocar de empresa: esquece a escolha e volta à tela do código.
    await page.getByRole('button', { name: 'Trocar de empresa' }).click();
    await page.waitForURL(/\/acesso/, { timeout: 20_000 });
    await expect(page.getByLabel('Código da empresa')).toBeVisible();
  });

  test('operador desativa o cliente', async ({ page }) => {
    await entrarNaPlataforma(page);
    const linha = page.getByRole('table', { name: 'Clientes' }).getByRole('row', { name: new RegExp(codigo) });
    await linha.getByRole('button', { name: `Ações de ${nome}` }).click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    const edicao = page.getByRole('dialog', { name: nome });
    await edicao.getByRole('switch', { name: 'Cliente ativo' }).click();
    await expect(edicao.getByRole('note')).toContainText('ninguém do cliente consegue usar a Aurora');
    await edicao.getByRole('button', { name: 'Salvar' }).click();
    await expect(edicao).toBeHidden();
    await expect(linha).toContainText('Inativo');
  });
});
