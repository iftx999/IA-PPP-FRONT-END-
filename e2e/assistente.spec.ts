import { expect, test, type Page } from '@playwright/test';
import { entrar } from './login';

/**
 * O caminho no servidor (ferramentas, escopo, verificação dos números) é coberto pelos testes de integração da API
 * com o modelo simulado. Aqui a resposta do modelo é simulada no navegador, no formato da API, para conferir a tela;
 * o ambiente local roda sem chave de IA (o segundo teste confere esse estado de verdade).
 */
const CONVERSA = { id: '0b8f4c2e-1111-4a1a-9a1a-000000000001', titulo: 'Quais setores estão abaixo do limite de alerta?',
  criadaEm: '2026-10-23T13:00:00Z', atualizadaEm: '2026-10-23T13:00:05Z' };

const RESPOSTA = {
  conversa: CONVERSA,
  mensagens: [
    { id: 'm1', papel: 'USUARIO', texto: CONVERSA.titulo, fontes: [], dados: [], numerosSemFonte: [], avaliacao: null,
      criadaEm: '2026-10-23T13:00:00Z' },
    {
      id: 'm2', papel: 'ASSISTENTE', avaliacao: null, criadaEm: '2026-10-23T13:00:05Z',
      texto: 'Um setor está abaixo do limite de alerta:\n- **Cidade A Norte**: 61,20% [1], com alerta em 70,00% [1].\n\n'
        + 'O **Cidade A Centro** está em atenção, com 78,50% [2]. A projeção é 95% em 2027.',
      fontes: [
        { numero: 1, titulo: 'Adesão à rede de esgoto', detalhe: 'Cidade A Norte · ago/2026' },
        { numero: 2, titulo: 'Adesão à rede de esgoto', detalhe: 'Cidade A Centro · ago/2026' },
      ],
      dados: [
        { fonte: 1, titulo: 'Cidade A Norte · ago/2026', campos: { Tipo: 'Setor comercial', Adesão: '61,20%',
          Ligados: '1.530', 'Com rede': '2.500', Meta: '85,00% (herdada de Cidade A)', 'Limite de alerta': '70,00%',
          Situação: 'Abaixo do alerta' } },
        { fonte: 2, titulo: 'Cidade A Centro · ago/2026', campos: { Tipo: 'Setor comercial', Adesão: '78,50%',
          Situação: 'Atenção' } },
      ],
      numerosSemFonte: ['95', '2027'],
    },
  ],
};

async function simularAssistente(page: Page): Promise<string[]> {
  const avaliacoes: string[] = [];
  await page.route('**/api/v1/assistente/situacao', (rota) =>
    rota.fulfill({ json: { disponivel: true, perguntasNoMes: 3, custoNoMesUsd: 0.12, limiteMensalUsd: 50 } }));
  await page.route('**/api/v1/assistente/perguntas', async (rota) => {
    expect(rota.request().postDataJSON()).toMatchObject({ pergunta: CONVERSA.titulo, conversaId: null });
    await new Promise((pronto) => setTimeout(pronto, 400));
    await rota.fulfill({ json: RESPOSTA });
  });
  await page.route(`**/api/v1/assistente/conversas/${CONVERSA.id}`, (rota) => rota.fulfill({ json: RESPOSTA }));
  await page.route('**/api/v1/assistente/mensagens/*/avaliacao', async (rota) => {
    avaliacoes.push(rota.request().postData() ?? '');
    await rota.fulfill({ status: 204 });
  });
  return avaliacoes;
}

test.describe('Assistente (épico G)', () => {
  test('pergunta com fontes, linha de dados, aviso de número sem fonte e avaliação', async ({ page }) => {
    const avaliacoes = await simularAssistente(page);
    await entrar(page, 'admin@exemplo.dev', '/assistente');
    await expect(page.getByRole('heading', { name: 'Assistente', level: 1 })).toBeVisible();
    await expect(page.getByText('3 perguntas · US$ 0.12 de 50')).toBeVisible();

    await page.locator('.sugestoes').getByRole('button', { name: CONVERSA.titulo }).click();
    await expect(page.getByText('Consultando as bases da Aurora…')).toBeVisible();
    const resposta = page.locator('.resposta');
    await expect(resposta).toContainText('Um setor está abaixo do limite de alerta');
    await expect(resposta.locator('li strong')).toHaveText('Cidade A Norte');
    await expect(resposta.locator('.marca')).toHaveCount(3);
    await expect(page).toHaveURL(new RegExp(`conversa=${CONVERSA.id}`));

    // G2: chip abre a linha de dados da fonte.
    await resposta.locator('.fontes').getByRole('button', { name: /Cidade A Norte/ }).click();
    const linha = resposta.getByRole('region', { name: 'Dados da fonte 1' });
    await expect(linha).toContainText('Abaixo do alerta');
    await expect(linha).toContainText('85,00% (herdada de Cidade A)');
    // G6: número fora das fontes é sinalizado.
    await expect(resposta.getByRole('note')).toContainText('Confira: 95, 2027 não aparecem nas fontes consultadas.');
    await page.screenshot({ path: 'e2e/capturas/assistente.png' });

    // G4: copiar e "Tem erro" com comentário.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await resposta.getByRole('button', { name: 'Copiar' }).click();
    await expect(resposta.getByRole('button', { name: 'Copiado' })).toBeVisible();
    await resposta.getByRole('button', { name: 'Tem erro' }).click();
    const dialogo = page.getByRole('dialog', { name: 'O que está errado?' });
    await dialogo.getByLabel('Comentário (opcional)').fill('Faltou o setor Sul.');
    await dialogo.getByRole('button', { name: 'Enviar' }).click();
    await expect(dialogo).toBeHidden();
    await expect(resposta.getByRole('button', { name: 'Tem erro' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(avaliacoes[0]!)).toEqual({ avaliacao: -1, comentario: 'Faltou o setor Sul.' });
  });

  test('sem chave de IA no ambiente: avisa e não deixa perguntar; Ctrl+J abre a tela', async ({ page }) => {
    await entrar(page, 'admin@exemplo.dev', '/painel');
    // G5: link do painel leva a pergunta com o contexto da unidade.
    await page.getByRole('link', { name: /Perguntar ao assistente sobre/ }).click();
    await expect(page).toHaveURL(/\/assistente\?unidade=.*pergunta=/);
    await expect(page.getByText('Perguntando a partir do painel')).toBeVisible();
    await expect(page.getByLabel('Sua pergunta')).toHaveValue(/Como está a adesão de .* em /);
    await expect(page.getByText('O assistente está desligado neste ambiente')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Perguntar' })).toBeDisabled();

    await page.goto('/painel');
    await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
    await page.keyboard.press('Control+j');
    await expect(page).toHaveURL(/\/assistente$/);
  });

  test('perfil sem assistente não acessa', async ({ page }) => {
    await entrar(page, 'auditoria@exemplo.dev', '/assistente');
    await expect(page.getByText('Seu perfil não permite usar o assistente.')).toBeVisible();
  });
});
