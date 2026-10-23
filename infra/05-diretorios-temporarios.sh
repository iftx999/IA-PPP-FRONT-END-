#!/bin/sh
# Container somente leitura: a configuração gerada no início (nginx e /configuracao.json) vai para /tmp.
set -eu
mkdir -p /tmp/conf.d /tmp/aurora
