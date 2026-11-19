import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { entrar } from './login';

const EQUIPE = 'Equipe E2E Centro';
/** Imóveis da Cidade A com localização (Limeira, dentro do recorte do Valhalla). */
const MATRICULAS = ['1000010', '1000011', '1000012', '1000013', '1000014', '1000015'];

/**
 * Roteirização (J6, ADR 0046) contra o Valhalla do ambiente: seis vistorias, a equipe de
 * teste (com base, do campanhas.spec), calcular, fixar a última no começo, recalcular e
 * publicar. As OS criadas são canceladas no fim.
 */
test.describe('Roteirização', () => {
  test('do cálculo à publicação, com OS fixada', async ({ page }) => {
    test.setTimeout(180_000);
    const errosNoConsole: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') {
        errosNoConsole.push(m.text());
      }
    });
    const token = capturarToken(page);
    await entrar(page, 'admin@exemplo.dev', '/roteirizacao');
    const api = new Api(page.request, await token);
    const opcoes = await api.get('/api/v1/ordens/opcoes');
    const vistoria = opcoes.servicos.find((s: { codigo: string }) => s.codigo === 'VISTORIA').id;
    await api.post('/api/v1/ordens/imoveis', {
      servicoId: vistoria,
      matriculas: MATRICULAS,
      prioridade: 'MEDIA',
    });

    try {
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Roteirização');
      const equipe = page.getByRole('checkbox', { name: new RegExp(EQUIPE) });
      await expect(equipe).toBeChecked();
      await expect(
        page.getByRole('checkbox', { name: /Vistoria de viabilidade/ }).first(),
      ).toBeChecked();
      await page.screenshot({ path: 'e2e/capturas/roteirizacao-escolha.png' });

      await page.getByRole('button', { name: 'Calcular rotas' }).click();
      await expect(page.getByText('Calculando as rotas…')).toBeVisible();
      await expect(page.getByText('Pronta para publicar')).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText(/Estimativa pela malha viária/)).toBeVisible();
      const rota = page.getByRole('region', { name: `Rota de ${EQUIPE}` });
      const paradas = rota.getByRole('listitem');
      const total = await paradas.count();
      expect(total).toBeGreaterThanOrEqual(MATRICULAS.length);
      await page.waitForTimeout(1500); // o mapa termina de enquadrar as rotas
      await page.screenshot({ path: 'e2e/capturas/roteirizacao-resultado.png' });
      expect(errosNoConsole.filter((e) => !/favicon|401|Realm/.test(e))).toEqual([]);
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        axe.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      ).toEqual([]);

      // Fixa a última parada: ela vai para o começo da rota no recálculo.
      const ultima = paradas.last();
      const numero = (await ultima.textContent())!.match(/OS (\d+)/)![1]!;
      await ultima.getByRole('button', { name: /Fixar OS/ }).click();
      await page.getByRole('button', { name: 'Recalcular' }).click();
      await expect(page.getByText('Calculando as rotas…')).toBeVisible();
      await expect(page.getByText('Pronta para publicar')).toBeVisible({ timeout: 90_000 });
      await expect(paradas.first()).toContainText(`OS ${numero}`);
      await expect(paradas.first().getByRole('button', { name: /Fixar OS/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await page.getByRole('button', { name: 'Publicar' }).click();
      await expect(page.getByText('Publicada', { exact: true })).toBeVisible();
      await expect(page.getByText(/OS programadas na ordem das rotas/)).toBeVisible();
    } finally {
      await api.cancelar(vistoria, MATRICULAS);
    }
  });
});

function capturarToken(page: Page): Promise<string> {
  return page
    .waitForRequest((r) => r.url().includes('/api/v1/') && !!r.headers()['authorization'], {
      timeout: 60_000,
    })
    .then((r) => r.headers()['authorization']!);
}

class Api {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  async get(url: string) {
    const r = await this.request.get(url, { headers: { Authorization: this.token } });
    expect(r.ok(), `${url}: ${await r.text()}`).toBeTruthy();
    return r.json();
  }

  async post(url: string, corpo: unknown) {
    const r = await this.request.post(url, { headers: { Authorization: this.token }, data: corpo });
    expect(r.ok(), `${url}: ${await r.text()}`).toBeTruthy();
    return r.json();
  }

  /** Cancela as OS abertas do serviço nas matrículas (limpeza do teste). */
  async cancelar(servico: string, matriculas: string[]): Promise<void> {
    const opcoes = await this.get('/api/v1/ordens/opcoes');
    const motivo = opcoes.motivos.find(
      (m: { tipo: string; codigo: string }) =>
        m.tipo === 'CANCELAMENTO' && m.codigo === 'DUPLICADA',
    ).id;
    for (const matricula of matriculas) {
      const pagina = await this.get(`/api/v1/ordens?servico=${servico}&busca=${matricula}`);
      for (const os of pagina.itens) {
        if (['PLANEJADA', 'PROGRAMADA', 'DEVOLVIDA'].includes(os.status)) {
          await this.post(`/api/v1/ordens/${os.id}/cancelar`, { motivoId: motivo });
        }
      }
    }
  }
}
