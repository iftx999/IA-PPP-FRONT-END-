import { chromium, expect, test } from '@playwright/test';
import { startFlow } from 'lighthouse';
import desktop from 'lighthouse/core/config/desktop-config.js';
import puppeteer from 'puppeteer-core';

/**
 * Core Web Vitals do painel (doc 09, 9.5; ADR 0034 do back-end) com o Lighthouse: LCP < 2,5 s, CLS < 0,1 e, no lugar
 * do INP (que exige interação real), Total Blocking Time < 200 ms. Precisa do build de produção:
 *
 *   npx ng serve -c production          # em vez do ng serve de desenvolvimento
 *   LIGHTHOUSE=1 npx playwright test e2e/desempenho.spec.ts
 *
 * Login e medição na mesma aba (a sessão OIDC fica no sessionStorage), sem o Lighthouse limpar o armazenamento.
 */
test.describe('Desempenho do front', () => {
  test.skip(!process.env['LIGHTHOUSE'], 'Só com LIGHTHOUSE=1, contra o build de produção.');
  test.setTimeout(180_000);

  for (const tela of ['/painel', '/sem-ligacao']) {
    test(`Core Web Vitals em ${tela}`, async ({ baseURL }) => {
      // Mesmo Chromium e mesma opção que o Playwright usa por padrão (sem sandbox: Ubuntu restringe user namespaces).
      const navegador = await puppeteer.launch({
        executablePath: chromium.executablePath(),
        headless: true,
        args: ['--no-sandbox'],
      });
      try {
        const pagina = await navegador.newPage();
        await pagina.setViewport({ width: 1440, height: 1000 });
        await pagina.goto(`${baseURL}/acesso`);
        await pagina.waitForSelector('input');
        await pagina.type('input', 'aurora');
        await Promise.all([pagina.waitForNavigation(), pagina.keyboard.press('Enter')]);
        await pagina.waitForSelector('#username');
        await pagina.type('#username', 'admin@exemplo.dev');
        await pagina.type('#password', 'aurora-dev');
        await Promise.all([pagina.waitForNavigation(), pagina.click('#kc-login')]);
        await pagina.waitForSelector('nav[aria-label="Menu principal"]', { timeout: 30_000 });

        const fluxo = await startFlow(pagina, { config: desktop, flags: { disableStorageReset: true } });
        await fluxo.navigate(`${baseURL}${tela}`, { name: tela });
        const resultado = await fluxo.createFlowResult();
        const auditorias = resultado.steps[0]!.lhr.audits;
        const lcp = auditorias['largest-contentful-paint']!.numericValue!;
        const cls = auditorias['cumulative-layout-shift']!.numericValue!;
        const tbt = auditorias['total-blocking-time']!.numericValue!;
        const nota = resultado.steps[0]!.lhr.categories['performance']!.score!;
        if (process.env['LIGHTHOUSE_DETALHE']) {
          const detalhes = (id: string) => (auditorias[id]?.details as { items?: Record<string, unknown>[] } | undefined)?.items ?? [];
          console.log(JSON.stringify({ tarefasLongas: detalhes('long-tasks').slice(0, 8), porScript: detalhes('bootup-time').slice(0, 8) }, null, 1));
        }
        console.log(`${tela}: LCP ${Math.round(lcp)} ms · CLS ${cls.toFixed(3)} · TBT ${Math.round(tbt)} ms · nota ${Math.round(nota * 100)}`);

        expect(lcp, 'LCP').toBeLessThan(2500);
        expect(cls, 'CLS').toBeLessThan(0.1);
        expect(tbt, 'TBT (no lugar do INP)').toBeLessThan(200);
      } finally {
        await navegador.close();
      }
    });
  }
});
