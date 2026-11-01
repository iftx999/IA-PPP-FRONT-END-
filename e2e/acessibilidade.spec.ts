import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { entrar } from './login';

/**
 * Acessibilidade (doc 07 e doc 09, 9.5): axe em cada tela, nos dois temas, contra WCAG 2.1 A e AA. Violação séria ou
 * crítica reprova; as demais aparecem no relatório do teste.
 */
const TELAS = [
  '/painel', '/metas', '/sem-ligacao', '/mapa', '/alertas', '/contratos', '/assistente',
  '/admin/unidades', '/admin/usuarios', '/admin/perfis', '/admin/integracoes',
];

/** Violações sérias ou críticas da tela, uma por linha (tela, regra, elementos e o detalhe do axe). */
async function violacoes(page: Page, nome: string): Promise<string[]> {
  // Espera o conteúdo (esqueletos de carregamento somem).
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // O canvas do MapLibre não é avaliável pelo axe; os controles do mapa são.
    .exclude('.maplibregl-canvas')
    .analyze();
  return resultado.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) =>
      v.nodes.map((n) => `${nome} · ${v.id} · ${n.target.join(' ')} · ${(n.failureSummary ?? '').split('\n').slice(1).join(' ')}`),
    );
}

test.describe('Acessibilidade', () => {
  test.setTimeout(180_000);

  for (const tema of ['dark', 'light'] as const) {
    test(`telas do cliente no tema ${tema === 'dark' ? 'escuro' : 'claro'}`, async ({ page }) => {
      await entrar(page, 'admin@exemplo.dev', '/painel');
      await page.evaluate((t) => localStorage.setItem('aurora.tema', t), tema);
      const achados: string[] = [];
      for (const tela of TELAS) {
        await page.goto(tela);
        achados.push(...(await violacoes(page, `${tela} (${tema})`)));
        if (tela === '/painel' || tela === '/sem-ligacao') {
          await page.screenshot({ path: `e2e/capturas/a11y-${tela.slice(1)}-${tema}.png` });
        }
      }
      expect(achados, 'violações sérias ou críticas').toEqual([]);
    });
  }

  test('auditoria (perfil Auditor)', async ({ page }) => {
    await entrar(page, 'auditoria@exemplo.dev', '/admin/auditoria');
    expect(await violacoes(page, '/admin/auditoria')).toEqual([]);
  });

  test('tela do código da empresa', async ({ page }) => {
    await page.goto('/acesso');
    expect(await violacoes(page, '/acesso')).toEqual([]);
  });
});
