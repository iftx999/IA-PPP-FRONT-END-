# syntax=docker/dockerfile:1.7
# Imagem do front da Aurora (ADR 0022 do back-end): build do Angular + nginx não-privilegiado, que serve o SPA com
# cabeçalhos de segurança e repassa /api para a API (mesma origem: sem CORS no navegador).
#   docker build -t aurora-web .

FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN npx ng build --configuration production

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY --from=build /src/dist/aurora-frontend/browser /usr/share/nginx/html
COPY infra/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY infra/configuracao.json.template /etc/aurora/configuracao.json.template
COPY --chmod=755 infra/05-diretorios-temporarios.sh /docker-entrypoint.d/05-diretorios-temporarios.sh
COPY --chmod=755 infra/40-configuracao-aurora.sh /docker-entrypoint.d/40-configuracao-aurora.sh
# /configuracao.json é gerado no início (em /tmp) a partir das variáveis do ambiente; o do build é só para o ng serve.
# conf.d aponta para /tmp: o container roda com o sistema de arquivos somente leitura.
USER root
RUN rm -f /usr/share/nginx/html/configuracao.json && rm -rf /etc/nginx/conf.d && ln -s /tmp/conf.d /etc/nginx/conf.d
USER 101
# Endereço interno da API e origens externas permitidas pela CSP (emissor OIDC e tiles do mapa).
ENV AURORA_API_ENDERECO=api:8080 \
    AURORA_DNS=127.0.0.11 \
    AURORA_EMISSOR=http://localhost:8180/realms/aurora \
    AURORA_CLIENTE_ID=aurora-web \
    AURORA_CSP_CONEXOES="http://localhost:8180 https://tile.openstreetmap.org" \
    AURORA_CSP_IMAGENS="https://tile.openstreetmap.org"
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/saude >/dev/null || exit 1
