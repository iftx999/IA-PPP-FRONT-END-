import { expect, test, type Page } from '@playwright/test';
import { entrar } from './login';

const MAILPIT = process.env['AURORA_MAILPIT'] ?? 'http://localhost:8025';

/** Link do último e-mail enviado ao destinatário (Mailpit do ambiente local). */
async function linkDoEmail(page: Page, destinatario: string): Promise<string> {
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
    }, { timeout: 15_000 })
    .toBeTruthy();
  return link!;
}

test('convite completo: e-mail, criação de senha, primeiro acesso e desativação', async ({ page, browser }) => {
  const email = `convite.e2e.${Date.now()}@exemplo.dev`;
  await entrar(page, 'admin@exemplo.dev', '/admin/usuarios');

  await page.getByRole('button', { name: 'Convidar usuário' }).click();
  const convite = page.getByRole('dialog', { name: 'Convidar usuário' });
  await convite.getByLabel('Nome completo').fill('Convite Ponta a Ponta');
  await convite.getByLabel('E-mail').fill(email);
  await convite.getByLabel('Perfil').click();
  await page.getByRole('option', { name: 'Gestor comercial' }).click();
  await convite.getByLabel('Unidade').fill('cidade b');
  await page.getByRole('option', { name: 'Cidade B', exact: true }).click();
  await convite.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(convite).toBeHidden();
  // Filtra pela busca: execuções anteriores deixam convites desativados e a lista é paginada.
  const filtrar = () => page.getByRole('textbox', { name: 'Buscar por nome ou e-mail' }).fill(email);
  await filtrar();
  const linha = page.getByRole('row', { name: new RegExp(email.replaceAll('.', '\\.')) });
  await expect(linha).toContainText('Convite pendente');

  // A pessoa convidada, em outro navegador: link do e-mail → confirma e-mail e cria a senha.
  const convidada = await (await browser.newContext({ locale: 'pt-BR' })).newPage();
  await convidada.goto(await linkDoEmail(page, email));
  const prosseguir = convidada.getByRole('link', { name: /clique aqui|click here/i });
  if (await prosseguir.isVisible().catch(() => false)) {
    await prosseguir.click();
  }
  await convidada.locator('#password-new').fill('Senha-forte-123');
  await convidada.locator('#password-confirm').fill('Senha-forte-123');
  await convidada.locator('[type=submit]').click();
  // Depois da senha, o Keycloak pode mostrar "conta atualizada" (com link de volta), o login ou já a Aurora;
  // sob carga essa página demora, então espera qualquer um dos três.
  const voltar = convidada.getByRole('link', { name: /voltar|back to application/i });
  const menu = convidada.getByRole('navigation', { name: 'Menu principal' });
  const usuario = convidada.locator('#username');
  await expect(menu.or(usuario).or(voltar)).toBeVisible({ timeout: 30_000 });
  if (await voltar.isVisible()) {
    await voltar.click();
    await expect(menu.or(usuario)).toBeVisible({ timeout: 20_000 });
  }
  if (await usuario.isVisible()) {
    await usuario.fill(email);
    await convidada.locator('#password').fill('Senha-forte-123');
    await convidada.locator('#kc-login').click();
  }
  await expect(convidada.getByRole('navigation', { name: 'Menu principal' })).toBeVisible({ timeout: 20_000 });

  // Primeiro acesso feito: deixa de ser convite pendente. Depois, desativar encerra o acesso.
  await page.reload();
  await filtrar();
  await expect(linha).toContainText('Ativo');
  await linha.getByRole('button', { name: /^Ações de / }).click();
  await page.getByRole('menuitem', { name: 'Desativar' }).click();
  const desativar = page.getByRole('dialog', { name: /^Desativar / });
  await desativar.getByRole('button', { name: 'Desativar' }).click();
  await expect(desativar).toBeHidden();
  await expect(linha).toContainText('Inativo');

  // O token ainda vale por alguns minutos, mas a API já recusa: o contexto é lido do banco a cada requisição.
  await convidada.reload();
  await expect(convidada.getByRole('alert')).toContainText('Sem acesso', { timeout: 20_000 });
});
