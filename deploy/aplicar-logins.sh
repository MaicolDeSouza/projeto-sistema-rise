#!/usr/bin/env bash
# O vigia dos logins (Opcao 1 do dono, 20/10/2026): o Rise grava dados/tinyauth/usuarios (Configuracoes › Usuarios ›
# Entrada no Rise) e o Tinyauth so le esse arquivo na partida. Roda no cron do HOST a cada minuto: se o arquivo mudou
# desde a ultima vez, confere o formato e REINICIA o Tinyauth (reiniciar mantem as sessoes abertas; recriar as perderia,
# medido). O conteiner do app nao tem acesso ao Docker, de proposito: com ele, quem controlasse o app controlaria a VPS.
#
# Fica quieto quando nada mudou. A marca do ultimo arquivo aplicado mora em ~/logs, fora de dados/ (o host nao escreve
# onde o conteiner escreve: ver o crontab).
set -euo pipefail
cd "$(dirname "$0")/.."

arquivo="dados/tinyauth/usuarios"
marca="${HOME}/logs/tinyauth-usuarios.sha256"
agora() { date '+%Y-%m-%d %H:%M:%S'; }
mkdir -p "${HOME}/logs"

# Sem o arquivo nao ha o que aplicar (o deploy o cria). Um link no lugar dele nao e do Rise: nao se segue.
[ -f "$arquivo" ] && [ ! -L "$arquivo" ] || exit 0

atual="$(sha256sum "$arquivo" | cut -d' ' -f1)"
anterior="$(cat "$marca" 2>/dev/null || true)"
[ "$atual" = "$anterior" ] && exit 0

# Linha fora de "nome:codigo bcrypt" faria o Tinyauth recusar o arquivo e o login cairia: nao reinicia, avisa uma vez.
if grep -v '^$' "$arquivo" | grep -qvE '^[A-Za-z0-9][A-Za-z0-9._-]{1,39}:\$2[aby]\$[0-9]{2}\$[A-Za-z0-9./]{53}$'; then
  if [ "$(cat "${marca}.invalido" 2>/dev/null || true)" != "$atual" ]; then
    echo "$(agora) aplicar-logins: o arquivo de logins tem linha fora do formato; o Tinyauth NAO foi reiniciado (o login segue com os de antes)."
    echo "$atual" > "${marca}.invalido"
  fi
  exit 1
fi

if ! docker compose restart auth </dev/null >/dev/null 2>&1; then
  echo "$(agora) aplicar-logins: falhou ao reiniciar o Tinyauth (docker compose restart auth); tenta de novo no próximo minuto."
  exit 1
fi
echo "$atual" > "$marca"
rm -f "${marca}.invalido"
echo "$(agora) aplicar-logins: logins aplicados ($(grep -c . "$arquivo" || true) pelo Rise, mais os do .env)."
