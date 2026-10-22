// Todo <form> precisa de [formGroup]: o app usa só ReactiveFormsModule, então sem ele não existe (ngSubmit)
// e o envio vira o submit nativo do navegador, que recarrega a página (defeito já visto em três telas).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function* templates(dir) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      yield* templates(caminho);
    } else if (nome.endsWith('.html')) {
      yield caminho;
    }
  }
}

const problemas = [];
for (const arquivo of templates('src/app')) {
  const texto = readFileSync(arquivo, 'utf8');
  for (const [tag] of texto.matchAll(/<form\b[^>]*>/g)) {
    if (!/\[formGroup\]/.test(tag)) {
      const linha = texto.slice(0, texto.indexOf(tag)).split('\n').length;
      problemas.push(`${arquivo}:${linha}  ${tag}`);
    }
  }
}
if (problemas.length) {
  console.error('Formulários sem [formGroup] (o envio recarregaria a página):\n' + problemas.join('\n'));
  process.exit(1);
}
console.log('Formulários: todos com [formGroup].');
