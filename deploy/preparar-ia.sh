#!/usr/bin/env bash
# Prepara a VPS para o servico do chat da loja (o Hobi). Roda UMA vez em /srv/rise/app, como o usuario rise, e SO com o
# ok do dono:
#
#   ./deploy/preparar-ia.sh
#
# O que faz (pode rodar de novo: so completa o que falta):
#   1. confere que o usuario de banco `rise_ia` existe (ele nasce numa migration, num deploy comum);
#   2. gera aqui mesmo o IA_SEGREDO e a senha do `rise_ia` (openssl), da o login ao usuario e acrescenta as duas linhas
#      ao .env, com uma copia do .env antes. Ninguem digita nem ve senha: ela nasce e fica nesta maquina;
#   3. liga o endereco hobi.4hobby.com.br no Caddy (copia o modelo).
#
# Depois dele: criar o registro DNS `hobi` apontando para esta VPS e rodar o deploy (./deploy/deploy-vps.sh), que sobe o
# servico. O chat continua DESLIGADO ate o dono ligar na tela do Rise.
#
# O conteiner `ia` recebe so IA_DATABASE_URL e IA_SEGREDO (docker-compose.yml); o resto do .env nunca chega a ele.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Sem .env em $(pwd): nada foi feito."; exit 1; }
[ -f deploy/caddy/assistente.modelo ] || { echo "Falta deploy/caddy/assistente.modelo: atualize o codigo antes. Nada foi feito."; exit 1; }

# O psql roda DENTRO do conteiner do banco, como o dono: a senha dele nao sai de la, e o SQL entra pela entrada padrao
# (nunca pela linha de comando, que aparece na lista de processos).
psql_do_dono() {
  docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At -q'
}

if [ "$(psql_do_dono <<'SQL'
SELECT count(*) FROM pg_roles WHERE rolname = 'rise_ia';
SQL
)" != "1" ]; then
  echo "O usuario de banco rise_ia ainda nao existe: faca antes um deploy comum (ele aplica a migration). Nada foi feito."
  exit 1
fi

TEM_SEGREDO=0
grep -qE '^[[:space:]]*IA_SEGREDO=[0-9a-f]{64}[[:space:]]*$' .env && TEM_SEGREDO=1
TEM_URL=0
grep -qE '^[[:space:]]*IA_DATABASE_URL=' .env && TEM_URL=1

if [ "${TEM_SEGREDO}" = 0 ] || [ "${TEM_URL}" = 0 ]; then
  COPIA=".env.bak-$(date +%Y%m%d-%H%M%S)"
  cp -p .env "${COPIA}"
  echo "Copia do .env guardada em ${COPIA}"
  # O .env pode terminar sem quebra de linha: sem isto a primeira linha nova colaria na ultima.
  [ -z "$(tail -c1 .env)" ] || echo >> .env
fi
umask 077

if [ "${TEM_SEGREDO}" = 0 ]; then
  SEGREDO="$(openssl rand -hex 32)"
  cat >> .env <<EOF

# Chat da loja (deploy/preparar-ia.sh): cifra as duas chaves do servico ia. O app grava, o servico le.
IA_SEGREDO=${SEGREDO}
EOF
  unset SEGREDO
  echo "IA_SEGREDO gerado e gravado no .env"
fi

if [ "${TEM_URL}" = 0 ]; then
  SENHA="$(openssl rand -hex 24)"
  BANCO="$(grep -E '^[[:space:]]*POSTGRES_DB=' .env | tail -1 | cut -d= -f2- | tr -d '[:space:]"' || true)"
  psql_do_dono <<SQL
ALTER ROLE rise_ia LOGIN PASSWORD '${SENHA}';
SQL
  cat >> .env <<EOF
# Chat da loja: a URL do usuario de banco RESTRITO. So ela (e o IA_SEGREDO) vai para o conteiner ia.
IA_DATABASE_URL=postgresql://rise_ia:${SENHA}@db:5432/${BANCO:-sistema_rise}
EOF
  unset SENHA
  echo "Senha do rise_ia gerada, aplicada no banco e gravada no .env"
fi

cp deploy/caddy/assistente.modelo deploy/caddy/ligado-assistente.caddy
echo "Endereco do chat ligado no Caddy (vale no proximo deploy)."

echo
echo "Pronto. Falta:"
echo "  1. o registro DNS 'hobi' (hobi.4hobby.com.br) apontando para esta VPS;"
echo "  2. rodar ./deploy/deploy-vps.sh (sobe o servico do chat e recarrega o Caddy);"
echo "  3. conferir de fora: https://hobi.4hobby.com.br/status deve responder {\"ligado\":false,...}"
echo "O chat continua desligado ate o dono ligar na tela do Rise."
