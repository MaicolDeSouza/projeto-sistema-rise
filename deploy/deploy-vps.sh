#!/usr/bin/env bash
# Deploy do Rise na VPS (migracao de 08/10/2026). Roda em /srv/rise/app, como o usuario rise:
#
#   ./deploy/deploy-vps.sh             # a main do GitHub
#   ./deploy/deploy-vps.sh <commit>    # um commit ou tag especifico
#
# So quando o dono pedir ("sobe"): a producao fala com a loja de verdade, e ele sabe quando ela mudou.
#
# Voltar o CODIGO para a versao anterior (a imagem fica guardada como rise:anterior):
#   docker image tag rise:anterior rise:latest && docker compose up -d app worker
# Voltar uma MIGRATION: so pelo dump que este script tira antes de aplica-la (as migrations do projeto nao
# tem caminho de volta).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Sem .env em $(pwd): nada foi feito."; exit 1; }

REF="${1:-origin/main}"
git fetch --quiet --tags origin
git checkout --quiet --detach "$REF"

# A versao do pe do menu e a hora do deploy em Sao Paulo, e e a mesma da tag local vps-<versao>.
VERSAO="$(TZ=America/Sao_Paulo date +%d.%m.%Y.%H.%M)"
COMMIT="$(git rev-parse --short HEAD)"
echo "== Deploy ${VERSAO} (commit ${COMMIT})"

if docker image inspect rise:latest >/dev/null 2>&1; then
  docker image tag rise:latest rise:anterior
fi

# Constroi com o sistema no ar: o KVM 2 tem memoria para o build (~2 GB) sem parar o site.
docker compose build --build-arg RISE_VERSAO="${VERSAO}" --build-arg RISE_COMMIT="${COMMIT}" app

# --wait: o banco precisa estar SAUDAVEL (healthcheck do compose), e nao so ligado, antes da pergunta abaixo.
docker compose up -d --wait db

# `migrate status` sai com codigo diferente de 0 quando ha migration pendente (ou quando o banco nao responde;
# nesse caso o backup abaixo tambem falha e o deploy para aqui, com o sistema antigo no ar).
PENDENTE=0
if ! docker compose run --rm --no-deps app npx prisma migrate status >/dev/null 2>&1; then
  PENDENTE=1
  echo "== Migration pendente: backup antes de aplicar"
  docker compose run --rm --no-deps app npm run backup
fi

# SIGTERM: o supervisor devolve as varreduras a fila sem gastar tentativa, como o `npm run worker:parar`
# (que sozinho nao serve aqui: o `restart: unless-stopped` religaria o worker na hora).
docker compose stop worker

if [ "${PENDENTE}" = 1 ]; then
  docker compose run --rm --no-deps app npx prisma migrate deploy
fi

docker compose up -d

# Confere o proprio site, sem passar pelo login: /produtos le o banco e prova que app e db conversam.
echo "== Conferindo o site"
PRONTO=0
for _ in $(seq 1 45); do
  if docker compose exec -T app node -e "fetch('http://localhost:3000/produtos').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    PRONTO=1
    break
  fi
  sleep 2
done
if [ "${PRONTO}" != 1 ]; then
  docker compose logs --tail 40 app
  echo "O site nao respondeu em 90 s. Para voltar: docker image tag rise:anterior rise:latest && docker compose up -d app worker"
  exit 1
fi

# De fora, pelo Caddy, sem login: o Tinyauth responde 401 a quem nao e navegador (curl) e redireciona (302)
# quem e. Qualquer outra coisa (200, 502, 000) e sinal de problema no login ou no proxy.
PUBLICO="$(curl -s -o /dev/null -w '%{http_code}' https://rise.4hobby.com.br/produtos || true)"
echo "== https://rise.4hobby.com.br/produtos sem login: ${PUBLICO} (esperado 401; navegador recebe 302)"

git tag -f "vps-${VERSAO}" >/dev/null
mkdir -p dados/logs
echo "${VERSAO} ${COMMIT}" >> dados/logs/deploy.log
docker compose ps
echo "== No ar: Versao ${VERSAO} (commit ${COMMIT})"
