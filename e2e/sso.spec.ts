import { expect, test, type Page } from '@playwright/test';
import { entrar } from './login';

/**
 * SSO corporativo (S10, ADR 0025) contra o Keycloak local: o realm `corporativo-exemplo` faz o papel do diretório da
 * empresa (Entra ID, Okta…). Os testes rodam em série: configuram o SSO, entram por ele e o removem no fim. Se falhar
 * no meio, o botão "Empresa Exemplo (E2E)" fica na tela de login até alguém remover o SSO em Usuários.
 */
const NOME = 'Empresa Exemplo (E2E)';
const DESCOBERTA = 'http://localhost:8180/realms/corporativo-exemplo/.well-known/openid-configuration';

async function abrirSso(page: Page) {
  await entrar(page, 'admin@exemplo.dev', '/admin/usuarios');
  const cartao = page.getByRole('region', { name: /Login corporativo \(SSO\)/ });
  await cartao.getByRole('button', { name: /Configurar|Editar/ }).click();
  const dialogo = page.getByRole('dialog', { name: 'Login corporativo (SSO)' });
  await expect(dialogo).toBeVisible();
  return { cartao, dialogo };
}

async function entrarPelaEmpresa(page: Page, email: string) {
  await page.goto('/painel?cliente=aurora');
  await page.waitForURL(/\/realms\/aurora\//);
  await page.getByRole('link', { name: NOME }).click();
  await page.waitForURL(/\/realms\/corporativo-exemplo\//);
  await page.locator('#username').fill(email);
  await page.locator('#password').fill('corporativo-dev');
  await page.locator('#kc-login').click();
}

test.describe.serial('SSO corporativo', () => {
  test('administrador configura o IdP por OIDC', async ({ page }) => {
    const { cartao, dialogo } = await abrirSso(page);

    // Endereços para registrar no IdP mudam com o protocolo.
    await expect(dialogo.getByText('http://localhost:8180/realms/aurora/broker/corporativo/endpoint')).toBeVisible();
    await dialogo.getByRole('radio', { name: 'SAML 2.0' }).click();
    await expect(dialogo.getByText('Identificador (Entity ID)')).toBeVisible();
    await expect(dialogo.getByLabel('ID do aplicativo (client ID)')).toHaveCount(0);
    await dialogo.getByRole('radio', { name: 'OpenID Connect' }).click();

    // Validações no formulário antes de chamar a API.
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialogo.getByText('Informe o nome.')).toBeVisible();
    await expect(dialogo.getByText('Informe o client ID.')).toBeVisible();
    await expect(dialogo.getByText('Informe o segredo.')).toBeVisible();

    await dialogo.getByLabel('Nome no botão de login').fill(NOME);
    await dialogo.getByLabel('Endereço de descoberta (OpenID)').fill(DESCOBERTA.replace('corporativo-exemplo', 'nao-existe'));
    await dialogo.getByLabel('ID do aplicativo (client ID)').fill('aurora-sso');
    await dialogo.getByLabel('Segredo (client secret)').fill('sso-dev');
    // Endereço que não é um IdP: o Keycloak não consegue ler e a API explica.
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialogo.getByRole('alert')).toContainText('Não foi possível ler a configuração do provedor');

    await dialogo.getByLabel('Endereço de descoberta (OpenID)').fill(DESCOBERTA);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/capturas/sso-configuracao.png' });
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialogo).toBeHidden();
    await expect(cartao.getByText('Ativo')).toBeVisible();
    await expect(cartao).toContainText(`Botão “${NOME}” na tela de login, por OpenID Connect.`);
    await page.screenshot({ path: 'e2e/capturas/sso-usuarios.png' });
  });

  test('pessoa convidada entra com a conta da empresa', async ({ page }) => {
    await page.goto('/painel?cliente=aurora');
    await page.waitForURL(/\/realms\/aurora\//);
    await expect(page.getByRole('link', { name: NOME })).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/sso-login.png' });

    await entrarPelaEmpresa(page, 'diretoria@exemplo.dev');
    await page.waitForURL((url) => url.port === '4200' && url.pathname === '/painel');
    await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('conta da empresa sem convite é recusada', async ({ page }) => {
    await entrarPelaEmpresa(page, 'pessoa.externa@exemplo.dev');
    await expect(page.getByText('A conta pessoa.externa@exemplo.dev ainda não tem acesso à Aurora.')).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/sso-recusado.png' });
  });

  test('administrador remove o SSO e o botão some do login', async ({ page, browser }) => {
    const { cartao, dialogo } = await abrirSso(page);
    await expect(dialogo.getByLabel('Segredo (client secret)')).toHaveAttribute('placeholder', /mantém o atual/);
    await dialogo.getByRole('button', { name: 'Remover SSO' }).click();
    await expect(dialogo.getByRole('alert')).toContainText('desfaz o vínculo');
    await dialogo.getByRole('button', { name: 'Confirmar remoção' }).click();
    await expect(dialogo).toBeHidden();
    await expect(cartao.getByRole('button', { name: 'Configurar' })).toBeVisible();

    // Navegador sem sessão: a tela de login volta a ter só e-mail e senha.
    const anonima = await browser.newPage();
    await anonima.goto('/painel?cliente=aurora');
    await anonima.waitForURL(/\/realms\/aurora\//);
    await expect(anonima.locator('#username')).toBeVisible();
    await expect(anonima.getByRole('link', { name: NOME })).toHaveCount(0);
    await anonima.close();
  });
});
