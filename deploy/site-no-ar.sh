#!/usr/bin/env bash
# Saude do Rise (pedido do dono em 25/10/2026): confere a cada 5 min, pelo cron do host, que o site responde DE FORA e
# bate no healthchecks.io (HEALTHCHECKS_SITE_URL). Sem a batida no horario, o healthchecks manda o e-mail: e o unico
# aviso que chega com a VPS inteira fora do ar (o Telegram sai do worker, que cai junto).
#
# As mesmas duas conferencias do fim do deploy-vps.sh:
#   - uma foto que nao existe, no formato exato: 404 = o Caddy e o app responderam;
#   - /produtos sem login: 401 = o Tinyauth respondeu e o login continua fechado (200 aqui seria o login aberto).
# Quieto quando esta tudo certo; uma linha no cron.log e a batida de falha (/fail) quando nao esta.
set -uo pipefail
cd "$(dirname "$0")/.."
source deploy/lib.sh

AVISO="$(ler_env HEALTHCHECKS_SITE_URL)"
URL="https://rise.4hobby.com.br"
codigo() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@" || true; }

APP="$(codigo "${URL}/api/arquivos/deploy-teste/imagens/00000000000000000000000000000000.jpg")"
LOGIN="$(codigo "${URL}/produtos")"

if [ "${APP}" = 404 ] && [ "${LOGIN}" = 401 ]; then
  avisar ""
else
  echo "SITE FORA DO AR ($(date)): app ${APP} (esperado 404) | login ${LOGIN} (esperado 401)"
  avisar /fail
fi
