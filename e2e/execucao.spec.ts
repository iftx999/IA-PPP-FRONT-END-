import AxeBuilder from '@axe-core/playwright';
import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { entrar } from './login';

const EQUIPE = 'Equipe E2E Centro';
const RUA = 'palmeiras e2e';
const MODELO = 'Celular E2E';
/** JPEG 1×1 válido (a web mostra a foto). */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

/**
 * ADR 0045 (J8–J11, J13): o celular (simulado pela API do app, com a sessão do navegador) abre a jornada, inicia e
 * encerra uma OS com parâmetros e foto e trabalha noutra que a programação cancelou. Na web: registros do campo com
 * valores e foto, caixa de conflitos com a decisão e o bloqueio do celular. Depende de logradouros.spec.ts (rua) e
 * campanhas.spec.ts (equipe com o admin). Termina com as OS fechadas e a jornada encerrada.
 */
test.describe('Execução de campo', () => {
  test('do celular aos registros, conflitos e bloqueio', async ({ page }) => {
    test.setTimeout(150_000);
    const token = capturarToken(page);
    await entrar(page, 'admin@exemplo.dev', '/ordens');
    const api = new ApiDoApp(page.request, await token);

    // Duas OS de notificação na rua, programadas para hoje; a segunda é cancelada depois.
    const servico = await api.servico('NOTIFICACAO');
    const motivos = await api.motivos();
    const logradouro = (
      await api.get(`/api/v1/logradouros?busca=${encodeURIComponent(RUA)}&pagina=0`)
    ).itens[0].id;
    const lote = await api.post('/api/v1/ordens/lotes', {
      faixa: {
        logradouroId: logradouro,
        numeroInicial: null,
        numeroFinal: null,
        lado: 'AMBOS',
        servicoId: servico,
      },
      prioridade: 'MEDIA',
    });
    expect(lote.criadas).toBeGreaterThanOrEqual(2);
    const ordens = (await api.get(`/api/v1/ordens?lote=${lote.loteId}&pagina=0&tamanho=50`)).itens;
    const [a, b, ...resto] = ordens;
    const equipe = (await api.get('/api/v1/ordens/equipes')).find(
      (e: { nome: string }) => e.nome === EQUIPE,
    ).id;
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    await api.post('/api/v1/ordens/programar', {
      ordens: [a.id, b.id],
      equipeId: equipe,
      data: hoje,
    });
    for (const o of resto) {
      await api.post(`/api/v1/ordens/${o.id}/cancelar`, { motivoId: motivos.DUPLICADA });
    }

    // O celular: cadastro, jornada, início e encerramento com foto.
    await api.campo('/api/v1/campo/dispositivo', {
      modelo: MODELO,
      sistema: 'Android 15',
      versaoApp: '1.0.0',
    });
    const pacote = await api.campo('/api/v1/campo/jornada/inicio', {
      id: randomUUID(),
      equipeId: equipe,
      ocorridoEm: agora(-60),
      posicao: { latitude: -22.9, longitude: -47.06, precisaoM: 10 },
    });
    expect(pacote.ids).toContain(a.id);
    const foto = randomUUID();
    let r = await api.eventos(
      { id: randomUUID(), osId: a.id, sequencia: 1, tipo: 'INICIAR', ocorridoEm: agora(-50) },
      {
        id: randomUUID(),
        osId: a.id,
        sequencia: 2,
        tipo: 'ENCERRAR',
        resultado: 'EXECUTADA',
        valores: { entregue_a: 'Morador', foto: [foto] },
        ocorridoEm: agora(-40),
        posicao: { latitude: -22.9, longitude: -47.06, precisaoM: 6 },
      },
    );
    expect(r.eventos.map((e: { situacao: string }) => e.situacao)).toEqual([
      'APLICADO',
      'APLICADO',
    ]);
    await api.foto(foto, a.id, 'foto');

    // A programação cancela a segunda, mas a equipe já tinha começado: vale o campo.
    await api.post(`/api/v1/ordens/${b.id}/cancelar`, { motivoId: motivos.DUPLICADA });
    r = await api.eventos({
      id: randomUUID(),
      osId: b.id,
      sequencia: 1,
      tipo: 'INICIAR',
      ocorridoEm: agora(-30),
    });
    expect(r.eventos[0].situacao).toBe('CONFLITO');

    // Web: registros do campo com o valor e a foto.
    await page.goto(`/ordens?lote=${lote.loteId}`);
    const linhas = page.getByRole('region', { name: 'Ordens de serviço' }).locator('tbody tr');
    await linhas
      .filter({ hasText: String(a.numero) })
      .getByRole('button', { name: `Registros do campo da OS ${a.numero}` })
      .click();
    const registros = page.getByRole('dialog', { name: new RegExp(`OS ${a.numero}`) });
    await expect(registros.getByText('Iniciou')).toBeVisible();
    await expect(registros.getByText('Encerrou')).toBeVisible();
    await expect(registros.getByRole('definition').filter({ hasText: 'Morador' })).toBeVisible();
    await expect(registros.getByRole('img', { name: 'Foto do aviso' })).toBeVisible();
    await expectSemViolacoes(page);
    await page.screenshot({ path: 'e2e/capturas/execucao-registros.png' });
    await registros.getByRole('button', { name: 'Fechar' }).click();

    // Caixa de conflitos: decide.
    await page.getByRole('button', { name: /Conflitos de campo/ }).click();
    const conflitos = page.getByRole('dialog', { name: 'Conflitos de campo' });
    const item = conflitos.getByRole('listitem').filter({ hasText: `OS ${b.numero}` });
    await expect(item).toContainText('OS cancelada');
    await item.getByRole('button', { name: 'Decidir' }).click();
    await item.getByLabel('Decisão').fill('Mantida com a equipe que já estava no local.');
    await item.getByRole('button', { name: 'Registrar decisão' }).click();
    await expect(conflitos.getByText(/Nenhum conflito aberto|Decisão de/).first()).toBeVisible();
    await expectSemViolacoes(page);
    await conflitos.getByRole('button', { name: 'Fechar' }).click();

    // Fecha a segunda (não executada) e a jornada.
    r = await api.eventos({
      id: randomUUID(),
      osId: b.id,
      sequencia: 2,
      tipo: 'ENCERRAR',
      resultado: 'NAO_EXECUTADA',
      motivoId: motivos.RECUSA,
      ocorridoEm: agora(-20),
    });
    expect(r.eventos[0].situacao).toBe('APLICADO');
    await api.campo('/api/v1/campo/jornada/fim', { ocorridoEm: agora(-10) });

    // Celulares: bloquear o do teste.
    await page.goto('/celulares');
    const linha = page.getByRole('row').filter({ hasText: MODELO }).first();
    await linha.getByRole('button', { name: 'Bloquear' }).click();
    await page
      .getByRole('dialog', { name: 'Bloquear o celular?' })
      .getByRole('button', { name: 'Bloquear' })
      .click();
    await expect(page.getByText(/Celular de .* bloqueado\./)).toBeVisible();
    await page
      .getByRole('radio', { name: 'Bloqueados' })
      .or(page.getByRole('button', { name: 'Bloqueados' }))
      .click();
    await expect(page.getByRole('row').filter({ hasText: MODELO }).first()).toContainText(
      'Bloqueado',
    );
    await page.screenshot({ path: 'e2e/capturas/celulares.png', fullPage: true });
    expect((await api.campoBruto('/api/v1/campo/jornada')).status()).toBe(403);
  });
});

async function expectSemViolacoes(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const graves = axe.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(graves).toEqual([]);
}

/** O token que o app manda à API (a sessão do navegador). */
function capturarToken(page: Page): Promise<string> {
  return page
    .waitForRequest((r) => r.url().includes('/api/v1/') && !!r.headers()['authorization'], {
      timeout: 60_000,
    })
    .then((r) => r.headers()['authorization']);
}

function agora(segundos: number): string {
  return new Date(Date.now() + segundos * 1000).toISOString();
}

/** A API vista pelo app de campo e pela programação. */
class ApiDoApp {
  readonly celular = randomUUID();

  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  private cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: this.token, ...extra };
  }

  async get(url: string) {
    const r = await this.request.get(url, { headers: this.cabecalhos() });
    expect(r.ok(), `${url}: ${await r.text()}`).toBeTruthy();
    return r.json();
  }

  async post(url: string, corpo: unknown) {
    const r = await this.request.post(url, { headers: this.cabecalhos(), data: corpo });
    expect(r.ok(), `${url}: ${await r.text()}`).toBeTruthy();
    return r.json();
  }

  async campo(url: string, corpo: unknown) {
    const r = await this.request.post(url, {
      headers: this.cabecalhos({ 'X-Aurora-Dispositivo': this.celular }),
      data: corpo,
    });
    expect(r.ok(), `${url}: ${await r.text()}`).toBeTruthy();
    return r.json();
  }

  campoBruto(url: string) {
    return this.request.get(url, {
      headers: this.cabecalhos({ 'X-Aurora-Dispositivo': this.celular }),
    });
  }

  eventos(...eventos: object[]) {
    return this.campo('/api/v1/campo/eventos', { enviadoEm: new Date().toISOString(), eventos });
  }

  async foto(id: string, os: string, parametro: string): Promise<void> {
    const r = await this.request.put(`/api/v1/campo/anexos/${id}?os=${os}&parametro=${parametro}`, {
      headers: this.cabecalhos({
        'X-Aurora-Dispositivo': this.celular,
        'Content-Type': 'image/jpeg',
        'Content-Range': `bytes 0-${JPEG.length - 1}/${JPEG.length}`,
        'X-Conteudo-Sha256': createHash('sha256').update(JPEG).digest('hex'),
      }),
      data: JPEG,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    expect((await r.json()).situacao).toBe('DISPONIVEL');
  }

  async servico(codigo: string): Promise<string> {
    const opcoes = await this.get('/api/v1/ordens/opcoes');
    return opcoes.servicos.find((s: { codigo: string }) => s.codigo === codigo).id;
  }

  /** Motivos pelo código: DUPLICADA (cancelamento), RECUSA (não execução). */
  async motivos(): Promise<Record<string, string>> {
    const opcoes = await this.get('/api/v1/ordens/opcoes');
    const achar = (tipo: string, codigo: string) =>
      opcoes.motivos.find(
        (m: { tipo: string; codigo: string }) => m.tipo === tipo && m.codigo === codigo,
      ).id;
    return {
      DUPLICADA: achar('CANCELAMENTO', 'DUPLICADA'),
      RECUSA: achar('NAO_EXECUCAO', 'SEM_INTERESSE'),
    };
  }
}
