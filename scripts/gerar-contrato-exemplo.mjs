// Gera e2e/exemplos/contrato-exemplo.pdf a partir do HTML (contrato fictício para demonstração e testes).
//   node scripts/gerar-contrato-exemplo.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const html = fileURLToPath(new URL('../e2e/exemplos/contrato-exemplo.html', import.meta.url));
const pdf = fileURLToPath(new URL('../e2e/exemplos/contrato-exemplo.pdf', import.meta.url));

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.goto(pathToFileURL(html).href);
await pagina.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
await navegador.close();
console.log(`Gerado: ${pdf}`);
