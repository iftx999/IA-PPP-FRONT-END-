#!/bin/sh
# Gera /configuracao.json (lido pelo front antes de iniciar) a partir das variáveis do ambiente.
set -eu
# Em /tmp: o container pode rodar com o sistema de arquivos somente leitura (só /tmp e o cache são graváveis).
envsubst '${AURORA_EMISSOR} ${AURORA_CLIENTE_ID}' < /etc/aurora/configuracao.json.template > /tmp/aurora/configuracao.json
