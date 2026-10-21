# Aurora — front-end

SPA em **Angular 22** (componentes standalone, signals, zoneless) da Aurora, sistema de acompanhamento da adesão
à rede de esgoto em concessões de saneamento. Projeto de estudo; os dados de demonstração são fictícios.

API, infraestrutura e especificação: [IA-PPP-BACK-END](https://github.com/iftx999/IA-PPP-BACK-END)
(identidade visual em `docs/07-identidade-visual.md`).

```bash
npm ci
npx ng serve              # http://localhost:4200 (proxy /api -> localhost:8080)
npx ng test --watch=false # testes de unidade (Vitest)
npx ng lint               # ESLint (angular-eslint)
npm run e2e               # Playwright: requer infra + API rodando (ver IA-PPP-BACK-END)
npm run api:gerar         # regenera os tipos a partir da OpenAPI da API local
```

Os tipos da API (`src/app/api/esquema.ts`) são **gerados**: depois de mudar um contrato no back-end, rode
`npm run api:gerar` e corrija o que o compilador apontar.

Os design tokens ficam em `src/styles/_tokens.scss`; os componentes não usam cores fixas.
O tema claro/escuro é definido pelo atributo `data-theme`.
