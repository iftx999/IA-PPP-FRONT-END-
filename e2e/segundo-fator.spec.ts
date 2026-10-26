import { expect, test } from '@playwright/test';
import { entrar } from './login';

/**
 * Verificação em duas etapas (H9). Ligar a política de verdade afetaria os outros E2E (vale para o tenant inteiro);
 * a recusa da API é simulada no navegador. A regra no servidor é coberta por SegundoFatorApiTest.
 */
test.describe('Verificação em duas etapas', () => {
  test('recusa por falta do código leva a entrar de novo com prompt=login', async ({ page }) => {
    await entrar(page, 'diretoria@exemplo.dev', '/painel');
    await page.route('**/api/v1/eu', (rota) =>
      rota.fulfill({
        status: 403,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          status: 403,
          detail: 'A verificação em duas etapas é obrigatória para o seu acesso.',
          codigo: 'SEGUNDO_FATOR_NECESSARIO',
        }),
      }),
    );
    // Recarrega com a sessão aberta: a primeira chamada a /eu já é recusada.
    await page.goto('/metas');

    const aviso = page.getByRole('alert').filter({ hasText: 'Verificação em duas etapas' });
    await expect(aviso).toBeVisible();
    await expect(page.getByText('Sem acesso')).toHaveCount(0);
    await page.screenshot({ path: 'e2e/capturas/segundo-fator-aviso.png' });

    const login = page.waitForRequest((r) => r.url().includes('/protocol/openid-connect/auth'));
    await aviso.getByRole('button', { name: 'Entrar com o código' }).click();
    expect(new URL((await login).url()).searchParams.get('prompt')).toBe('login');
    // prompt=login pede a senha de novo mesmo com a sessão aberta no Keycloak.
    await expect(page.locator('#password')).toBeVisible();
  });

  test('administrador vê a política e a situação de cada pessoa', async ({ page }) => {
    await entrar(page, 'admin@exemplo.dev', '/admin/usuarios');
    const politica = page.getByRole('region', { name: 'Verificação em duas etapas' });
    await expect(politica.getByRole('switch', { name: 'Exigir de todos os usuários' })).not.toBeChecked();

    await page.getByLabel('Buscar por nome ou e-mail').fill('diretoria@');
    const linha = page.getByRole('table').getByRole('row', { name: /diretoria@exemplo\.dev/ });
    await linha.getByRole('button', { name: /^Ações de / }).click();
    await page.getByRole('menuitem', { name: 'Verificação em duas etapas' }).click();
    const dialogo = page.getByRole('dialog', { name: /^Verificação em duas etapas de / });
    // Consulta real ao Keycloak pela API (conta de serviço aurora-api-admin).
    await expect(dialogo.getByText('Não cadastrado')).toBeVisible();
    await expect(dialogo.getByText('Opcional para esta pessoa')).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'Remover aplicativo' })).toHaveCount(0);
    await page.waitForTimeout(300); // fim da animação de abertura
    await page.screenshot({ path: 'e2e/capturas/segundo-fator-usuario.png' });
    await dialogo.getByRole('button', { name: 'Fechar' }).click();
    await expect(dialogo).toBeHidden();
  });
});
