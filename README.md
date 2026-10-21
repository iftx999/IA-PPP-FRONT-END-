# Aurora — front-end

SPA em **Angular 22** (componentes standalone, signals, zoneless) da Aurora, sistema de acompanhamento da adesão
à rede de esgoto em concessões de saneamento. Projeto de estudo; os dados de demonstração são fictícios.

API, infraestrutura e especificação: [IA-PPP-BACK-END](https://github.com/iftx999/IA-PPP-BACK-END)
(identidade visual em `docs/07-identidade-visual.md`).

```bash
npm ci
npx ng serve            # http://localhost:4200
npx ng test --watch=false
```

Os design tokens ficam em `src/styles/_tokens.scss`; os componentes não usam cores fixas.
O tema claro/escuro é definido pelo atributo `data-theme`.
