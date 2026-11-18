import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { entrar } from './login';

const TRECHOS = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    trecho('E2E-101-1', 1, 99, 'IMPAR', [
      [-47.406, -22.564],
      [-47.403, -22.564],
    ]),
    trecho('E2E-101-2', 2, 100, 'PAR', [
      [-47.406, -22.5642],
      [-47.403, -22.5642],
    ]),
    {
      type: 'Feature',
      properties: {
        codigo_logradouro: 'E2E-102',
        nome: 'Rua Trocada E2E',
        codigo_trecho: 'E2E-102-1',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-22.56, -47.4],
          [-22.57, -47.41],
        ],
      },
    },
  ],
});

const ENDERECOS =
  'matricula;codigo_logradouro;numero;complemento\n1000000;E2E-101;15;Casa 2\n1000001;E2E-101;20;\n1000002;E2E-101;S/N;\nX-NAO-EXISTE;E2E-101;7;\n';

function trecho(
  codigo: string,
  inicial: number,
  final: number,
  lado: string,
  coordenadas: number[][],
) {
  return {
    type: 'Feature',
    properties: {
      codigo_logradouro: 'E2E-101',
      tipo: 'Rua',
      nome: 'Rua das Palmeiras E2E',
      bairro: 'Centro',
      codigo_trecho: codigo,
      numero_inicial: inicial,
      numero_final: final,
      lado,
    },
    geometry: { type: 'LineString', coordinates: coordenadas },
  };
}

/**
 * ADR 0043 (J3): importação de trechos e endereços com simulação, busca do logradouro, mapa dos trechos, imóveis na
 * ordem da numeração com o trecho escolhido pela faixa, e acessibilidade do detalhe.
 */
test.describe('Logradouros e trechos', () => {
  test('do arquivo da concessionária ao trecho de cada imóvel', async ({ page }) => {
    test.setTimeout(120_000);
    await entrar(page, 'admin@exemplo.dev', '/logradouros');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Logradouros e trechos');

    // Trechos: simular mostra o relatório sem gravar; só então "Importar" fica disponível.
    await page.getByRole('button', { name: 'Importar trechos' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Importar trechos' });
    await dialogo.getByLabel('Município').click();
    await page.getByRole('option', { name: 'Cidade A', exact: true }).click();
    await dialogo.getByLabel('Arquivo da importação').setInputFiles({
      name: 'ruas-e2e.geojson',
      mimeType: 'application/geo+json',
      buffer: Buffer.from(TRECHOS),
    });
    await expect(dialogo.getByRole('button', { name: 'Importar', exact: true })).toBeDisabled();
    await dialogo.getByRole('button', { name: 'Simular' }).click();
    await expect(dialogo.getByText('Simulação: nada foi gravado')).toBeVisible();
    await expect(dialogo.getByRole('table', { name: 'Itens recusados' })).toContainText(
      'Coordenada fora do Brasil',
    );
    await dialogo.getByRole('button', { name: 'Importar', exact: true }).click();
    await expect(dialogo.getByText('Importação concluída')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Fechar' }).click();

    // Endereços.
    await page.getByRole('button', { name: 'Importar endereços' }).click();
    const enderecos = page.getByRole('dialog', { name: 'Importar endereços' });
    await enderecos.getByLabel('Arquivo da importação').setInputFiles({
      name: 'enderecos-e2e.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(ENDERECOS),
    });
    await enderecos.getByRole('button', { name: 'Simular' }).click();
    await expect(enderecos.getByRole('table', { name: 'Itens recusados' })).toContainText(
      'X-NAO-EXISTE',
    );
    await enderecos.getByRole('button', { name: 'Importar', exact: true }).click();
    await expect(enderecos.getByText('Importação concluída')).toBeVisible();
    await enderecos.getByRole('button', { name: 'Fechar' }).click();

    // Busca sem acento, cobertura do município e o detalhe.
    await page.getByLabel('Município').click();
    await page.getByRole('option', { name: 'Cidade A', exact: true }).click();
    await expect(
      page.getByRole('region', { name: /Cobertura do cadastro em Cidade A/ }),
    ).toContainText('Com endereço');
    await page.getByRole('searchbox', { name: 'Buscar logradouro' }).fill('palmeiras e2e');
    await expect(page).toHaveURL(/busca=palmeiras/);
    await page.screenshot({ path: 'e2e/capturas/logradouros.png', fullPage: true });
    await page.getByRole('link', { name: 'Rua das Palmeiras E2E' }).click();

    await expect(page).toHaveURL(/\/logradouros\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rua das Palmeiras E2E');
    const trechos = page.getByRole('region', { name: 'Trechos', exact: true });
    await expect(trechos.getByRole('row')).toHaveCount(3);
    await expect(trechos).toContainText('1 a 99 · lado ímpar');
    const imoveis = page.getByRole('region', { name: 'Imóveis na ordem da numeração' });
    await expect(imoveis.getByRole('row').nth(1)).toContainText('15');
    await expect(imoveis.getByRole('row').nth(1)).toContainText('E2E-101-1');
    await expect(imoveis.getByRole('row').nth(2)).toContainText('E2E-101-2');
    await expect(imoveis.getByRole('row').nth(3)).toContainText('S/N');
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    await page.screenshot({ path: 'e2e/capturas/logradouro.png', fullPage: true });

    // Correção da faixa abre com os valores atuais.
    await trechos.getByRole('button', { name: 'Corrigir a numeração do trecho E2E-101-1' }).click();
    const faixa = page.getByRole('dialog', { name: 'Numeração do trecho E2E-101-1' });
    await expect(faixa.getByLabel('Número final')).toHaveValue('99');
    await faixa.getByRole('button', { name: 'Cancelar' }).click();

    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('.maplibregl-canvas')
      .analyze();
    expect(
      axe.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => v.id),
    ).toEqual([]);
  });
});
