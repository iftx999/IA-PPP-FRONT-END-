#!/bin/sh
# Gera /configuracao.json (lido pelo front antes de iniciar) a partir das variáveis do ambiente.
set -eu
# Em /tmp: o container pode rodar com o sistema de arquivos somente leitura (só /tmp e o cache são graváveis).
# Vários clientes na mesma instalação (ADR 0027): "true" mostra a tela do código da empresa antes do login.
export AURORA_ESCOLHER_CLIENTE="${AURORA_ESCOLHER_CLIENTE:-false}"
case "$AURORA_ESCOLHER_CLIENTE" in true|false) ;; *) echo "AURORA_ESCOLHER_CLIENTE deve ser true ou false" >&2; exit 1 ;; esac
export AURORA_EMISSOR_PLATAFORMA="${AURORA_EMISSOR_PLATAFORMA:-}"
envsubst '${AURORA_EMISSOR} ${AURORA_CLIENTE_ID} ${AURORA_ESCOLHER_CLIENTE} ${AURORA_EMISSOR_PLATAFORMA}' \
  < /etc/aurora/configuracao.json.template > /tmp/aurora/configuracao.json
