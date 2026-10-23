#!/bin/sh
# Gera /configuracao.json (lido pelo front antes de iniciar) a partir das variáveis do ambiente.
set -eu
envsubst '${AURORA_EMISSOR} ${AURORA_CLIENTE_ID}' < /etc/aurora/configuracao.json.template \
  > /usr/share/nginx/html/configuracao.json
