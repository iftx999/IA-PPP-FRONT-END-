import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { entrar } from './login';

const PDF = join(__dirname, 'exemplos', 'contrato-exemplo.pdf');

test.describe('Contratos', () => {
  // Sem chave de IA no ambiente local: o texto é lido e os itens são cadastrados à mão (a extração com IA é
  // coberta nos testes do back-end com a API simulada).
  test('cadastro, envio do PDF, itens manuais, aprovação e rejeição', async ({ page }) => {
    test.setTimeout(90_000);
    await entrar(page, 'admin@exemplo.dev', '/contratos');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contratos');

    const numero = `E2E-${Date.now()}`;
    await page.getByRole('button', { name: 'Novo contrato' }).click();
    const novo = page.getByRole('dialog', { name: 'Novo contrato' });
    await novo.getByLabel('Número').fill(numero);
    await novo.getByLabel('Unidade coberta').fill('concessao a');
    await page.getByRole('option', { name: 'Concessão A', exact: true }).click();
    await novo.getByLabel('Objeto (opcional)').fill('Esgotamento sanitário da Concessão A (fictício)');
    await novo.getByRole('button', { name: 'Criar contrato' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(numero);

    // Envio do PDF: a leitura roda em segundo plano e a tela acompanha.
    await page.getByLabel('Arquivo PDF do contrato').setInputFiles(PDF);
    const documento = page.locator('li.documento').filter({ hasText: 'contrato-exemplo.pdf' });
    await expect(documento).toContainText('Pronto', { timeout: 30_000 });
    await expect(documento).toContainText('cadastre os itens manualmente');
    await expect(documento).toContainText('3 páginas');
    await page.screenshot({ path: 'e2e/capturas/contrato.png', fullPage: true });

    // Item de prazo, cadastrado à mão e aprovado.
    await page.getByRole('button', { name: 'Novo item' }).click();
    let dialogo = page.getByRole('dialog', { name: 'Novo item' });
    await dialogo.getByRole('combobox', { name: 'Tipo' }).click();
    await page.getByRole('option', { name: 'Prazo' }).click();
    await dialogo.getByLabel('Cláusula').fill('8.1');
    await dialogo.getByRole('spinbutton', { name: 'Página' }).fill('2');
    await dialogo.getByLabel('Título').fill('Concluir a ETE Norte');
    await dialogo.getByLabel('Resumo').fill('Obra da ETE Norte concluída até junho de 2028.');
    await dialogo.getByLabel('Trecho do contrato').fill('concluir a Estação de Tratamento de Esgoto Norte até 30 de junho de 2028');
    // O PDF abre na página citada e o trecho digitado aparece destacado.
    await expect(dialogo.getByRole('img', { name: 'Página 2 do PDF' })).toBeVisible();
    await expect(dialogo.getByText('Trecho destacado')).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: 'e2e/capturas/contrato-revisao.png' });
    await dialogo.getByRole('button', { name: 'Cadastrar item' }).click();
    await expect(dialogo).toBeHidden();

    const itens = page.getByRole('region', { name: 'Itens do contrato' });
    await itens.getByRole('button', { name: 'Abrir item Concluir a ETE Norte' }).click();
    dialogo = page.getByRole('dialog', { name: /Revisar item/ });
    await dialogo.getByRole('button', { name: 'Aprovar' }).click();
    await expect(dialogo).toBeHidden();
    await itens.getByRole('radio', { name: /Aprovados/ }).click();
    await expect(itens.getByRole('button', { name: 'Abrir item Concluir a ETE Norte' })).toContainText('Aprovado');

    // Meta sem unidade e sem início de vigência não é aprovada; é rejeitada com motivo.
    await page.getByRole('button', { name: 'Novo item' }).click();
    dialogo = page.getByRole('dialog', { name: 'Novo item' });
    await dialogo.getByRole('combobox', { name: 'Tipo' }).click();
    await page.getByRole('option', { name: 'Meta' }).click();
    await dialogo.getByLabel('Cláusula').fill('7.1');
    await dialogo.getByRole('spinbutton', { name: 'Página' }).fill('2');
    await dialogo.getByLabel('Título').fill('Adesão mínima de 80% na Concessão A');
    await dialogo.getByLabel('Resumo').fill('80% até 2028, alerta em 75%.');
    await dialogo.getByLabel('Trecho do contrato').fill('adesão mínima de 80% (oitenta por cento)');
    await dialogo.getByRole('spinbutton', { name: 'Meta', exact: true }).fill('80');
    await dialogo.getByRole('spinbutton', { name: 'Limite de alerta' }).fill('75');
    await dialogo.getByRole('button', { name: 'Cadastrar item' }).click();
    await expect(dialogo).toBeHidden();
    await itens.getByRole('radio', { name: /Para revisar/ }).click();
    await itens.getByRole('button', { name: 'Abrir item Adesão mínima de 80% na Concessão A' }).click();
    dialogo = page.getByRole('dialog', { name: /Revisar item/ });
    await dialogo.getByRole('button', { name: 'Aprovar' }).click();
    await expect(dialogo.getByRole('alert')).toContainText('Para aprovar uma meta, informe: unidade, início da vigência.');
    await dialogo.getByRole('button', { name: 'Rejeitar' }).click();
    await dialogo.getByLabel('Motivo da rejeição').fill('Teste automatizado: meta já cadastrada');
    await dialogo.getByRole('button', { name: 'Confirmar rejeição' }).click();
    await expect(dialogo).toBeHidden();
    await itens.getByRole('radio', { name: /Rejeitados/ }).click();
    await expect(itens.getByRole('button', { name: 'Abrir item Adesão mínima de 80% na Concessão A' })).toContainText('Rejeitado');

    await page.goto('/contratos');
    await expect(page.getByRole('link', { name: new RegExp(numero) })).toContainText('1 itens aprovados');
    await page.screenshot({ path: 'e2e/capturas/contratos.png', fullPage: true });
  });

  test('perfil sem contratos não acessa', async ({ page }) => {
    await entrar(page, 'auditoria@exemplo.dev', '/contratos');
    await expect(page.getByText('Seu perfil não permite consultar contratos.')).toBeVisible();
  });
});
