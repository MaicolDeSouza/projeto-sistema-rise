#!/usr/bin/env bash
# Deploy do Rise na VPS (migracao de 08/10/2026). Roda em /srv/rise/app, como o usuario rise:
#
#   ./deploy/deploy-vps.sh             # a main do GitHub
#   ./deploy/deploy-vps.sh <commit>    # um commit ou tag especifico
#
# So quando o dono pedir ("sobe"): a producao fala com a loja de verdade, e ele sabe quando ela mudou.
#
# Voltar o CODIGO para a versao anterior (a imagem fica guardada como rise:anterior, a do ultimo deploy que passou
# em TODAS as conferencias):
#   docker image tag rise:anterior rise:latest && docker compose up -d app worker
# Voltar uma MIGRATION: so pelo dump que este script tira antes de aplica-la (as migrations do projeto nao
# tem caminho de volta).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Sem .env em $(pwd): nada foi feito."; exit 1; }

# Chave de TESTE que desliga o filtro de rede publica da coleta (ver `obter` em src/lib/coleta/http.js). A imagem de
# producao ja a ignora, mas ela nao tem o que fazer num .env de producao: melhor parar aqui do que deixar passar.
if grep -qE '^[[:space:]]*COLETA_PERMITIR_REDE_LOCAL=' .env; then
  echo "COLETA_PERMITIR_REDE_LOCAL esta no .env: e uma chave de TESTE e nao pode ficar na producao. Tire a linha e rode de novo. Nada foi feito."
  exit 1
fi

# Acessos (12/10/2026): simular o login de outra pessoa e coisa do PC. A imagem de producao ja a ignora; aqui ela para.
if grep -qE '^[[:space:]]*RISE_SIMULAR_LOGIN=' .env; then
  echo "RISE_SIMULAR_LOGIN esta no .env: e uma chave do PC de desenvolvimento e nao pode ficar na producao. Tire a linha e rode de novo. Nada foi feito."
  exit 1
fi

# Sem o segredo de borda o app nao aceita login nenhum (src/lib/acessos/sessao.js): o Rise subiria trancado para todos,
# inclusive o dono. Melhor parar antes de trocar os conteineres.
if ! grep -qE '^[[:space:]]*RISE_SEGREDO_DE_BORDA=[^[:space:]]{32,}' .env; then
  echo "Falta RISE_SEGREDO_DE_BORDA no .env (32 caracteres ou mais; gere com: openssl rand -hex 32). Sem ele ninguem entra no Rise. Nada foi feito."
  exit 1
fi

# O `set -e` encerra o script no meio, e sem isto o dono ficaria diante do erro cru do Prisma ou do Docker, com o
# worker parado e sem saber o que fazer. Cada etapa diz seu nome em PASSO; o backup so existe se houve migration.
PASSO="preparando"
DUMP_DO_DEPLOY=""
falhou() {
  echo
  echo "== O DEPLOY PAROU no passo: ${PASSO} (linha $1). O que ja foi trocado continua trocado: confira 'docker compose ps'."
  [ -z "${DUMP_DO_DEPLOY}" ] || echo "   Backup tirado antes das migrations: ${DUMP_DO_DEPLOY}"
  echo "   Voltar o codigo:  docker image tag rise:anterior rise:latest && docker compose up -d app worker"
  echo "   Worker parado?    docker compose up -d worker   (se a falha foi numa migration, confira o banco antes)"
}
trap 'falhou $LINENO' ERR

REF="${1:-origin/main}"
PASSO="baixando o codigo"
git fetch --quiet --tags origin
git checkout --quiet --detach "$REF"

# O Caddyfile NOVO e conferido antes de trocar qualquer coisa: um erro de sintaxe aqui para o deploy com o site
# antigo no ar, em vez de derrubar o Caddy depois (e com ele o login e o site).
PASSO="validando o Caddyfile"
if ! SAIDA_CADDY="$(docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile 2>&1)"; then
  echo "${SAIDA_CADDY}"
  echo "O Caddyfile novo e invalido: nada foi trocado."
  exit 1
fi

# A versao do pe do menu e a DATA do deploy em Sao Paulo mais o NUMERO do deploy (pedido do dono em 22/10/2026: tirar a
# hora; contador unico, nunca recomeca): o numero e o total de deploys que deram certo, as linhas de ~/logs/deploy.log
# (so o deploy que passa em tudo grava ali), mais 1. E a mesma da tag local vps-<versao>.
NUMERO_DO_DEPLOY="$(( $( [ -f "${HOME}/logs/deploy.log" ] && wc -l < "${HOME}/logs/deploy.log" || echo 0) + 1 ))"
VERSAO="$(TZ=America/Sao_Paulo date +%d.%m.%Y).$(printf '%02d' "${NUMERO_DO_DEPLOY}")"
COMMIT="$(git rev-parse --short HEAD)"
echo "== Deploy ${VERSAO} (commit ${COMMIT})"

# A imagem de volta atras sai da `rise:bom` (a do ultimo deploy que PASSOU em tudo), e nao da `rise:latest`: se o
# deploy anterior falhou e este e a tentativa seguinte, a latest e justamente a imagem quebrada, e copia-la para
# `rise:anterior` apagaria a unica copia boa. Sem `rise:bom` ainda (primeiro deploy com este script), a latest.
PASSO="guardando a imagem de volta atras"
if docker image inspect rise:bom >/dev/null 2>&1; then
  docker image tag rise:bom rise:anterior
elif docker image inspect rise:latest >/dev/null 2>&1; then
  docker image tag rise:latest rise:anterior
fi

# Constroi com o sistema no ar: o KVM 2 tem memoria para o build (~2 GB) sem parar o site.
PASSO="construindo a imagem"
docker compose build --build-arg RISE_VERSAO="${VERSAO}" --build-arg RISE_COMMIT="${COMMIT}" app

# --wait: o banco precisa estar SAUDAVEL (healthcheck do compose), e nao so ligado, antes da pergunta abaixo.
PASSO="subindo o banco"
docker compose up -d --wait db

# `migrate status` sai com codigo diferente de 0 quando ha migration pendente (ou quando o banco nao responde;
# nesse caso o backup abaixo tambem falha e o deploy para aqui, com o sistema antigo no ar).
PASSO="conferindo as migrations"
PENDENTE=0
if ! docker compose run --rm --no-deps app npx prisma migrate status >/dev/null 2>&1; then
  PENDENTE=1
  echo "== Migration pendente: backup antes de aplicar"
  PASSO="backup antes da migration"
  docker compose run --rm --no-deps app npm run backup
  DUMP_DO_DEPLOY="$(ls -t dados/backup/*.dump 2>/dev/null | head -n 1 || true)"
fi

# SIGTERM: o supervisor devolve as varreduras a fila sem gastar tentativa, como o `npm run worker:parar`
# (que sozinho nao serve aqui: o `restart: unless-stopped` religaria o worker na hora).
PASSO="parando o worker"
docker compose stop worker

if [ "${PENDENTE}" = 1 ]; then
  PASSO="aplicando as migrations"
  docker compose run --rm --no-deps app npx prisma migrate deploy
fi

# O arquivo de logins que o Rise grava (Configuracoes › Usuarios › Entrada no Rise): o Tinyauth CAI se ele nao existir
# (medido em 20/10/2026), e o `up -d` abaixo o recria. Criado pela imagem do app (como o app o grava), e nao pelo host: o
# host nao escreve onde o conteiner escreve (ver o crontab). Vazio vale: os logins do .env continuam entrando.
PASSO="preparando o arquivo de logins"
# `--user 0`: desde 22/10/2026 a imagem roda como `node` (uid 1000), e o `dados/` do host pode ter ficado de root (os
# deploys de antes). Este passo roda como root de proposito, para criar o arquivo onde quer que esteja.
docker run --rm --user 0 -v "${PWD}/dados:/app/dados" --entrypoint sh rise:latest -c \
  'mkdir -p /app/dados/tinyauth && { [ -f /app/dados/tinyauth/usuarios ] || : > /app/dados/tinyauth/usuarios; } && chmod 755 /app/dados/tinyauth && chmod 644 /app/dados/tinyauth/usuarios' </dev/null

# O conteiner deixou de rodar como root (revisao de seguranca de 22/10/2026): o `dados/` do host, gravado ate aqui pelo
# root dos conteineres antigos, passa para o uid 1000 (`node`), senao o app e o worker nao gravam foto, log nem backup.
# So o que ainda nao e do uid 1000 muda (o primeiro deploy varre tudo; os seguintes, quase nada). Pela imagem, como root:
# o host nao escreve onde o conteiner escreve.
PASSO="passando dados/ para o usuario do conteiner"
docker run --rm --user 0 -v "${PWD}/dados:/app/dados" --entrypoint sh rise:latest -c \
  'find /app/dados ! -user 1000 -exec chown 1000:1000 {} +' </dev/null

PASSO="trocando os conteineres"
docker compose up -d

# O Caddy so le o Caddyfile na partida ou no reload, e o `up -d` nao recria um conteiner so porque o conteudo de um
# arquivo montado mudou. Recarregar aqui e o que faz uma mudanca no Caddyfile valer. O conteiner pode ter acabado
# de ser recriado: algumas tentativas.
PASSO="recarregando o Caddy"
RECARREGOU=0
for _ in $(seq 1 10); do
  if docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    RECARREGOU=1
    break
  fi
  sleep 1
done
if [ "${RECARREGOU}" != 1 ]; then
  docker compose logs --tail 20 caddy
  echo "O Caddy nao aceitou a configuracao."
  false
fi

# Confere o proprio site, sem passar pelo login. Era /produtos, mas desde o Acessos lancamento 2 (22/10/2026) toda tela
# de bloco da 404 a quem chega sem login (o deploy daquele dia parou aqui com o site no ar); o Painel (/) responde 200.
# O banco ja foi conferido pelo `migrate status` acima.
echo "== Conferindo o site"
PASSO="conferindo o site por dentro"
PRONTO=0
for _ in $(seq 1 45); do
  if docker compose exec -T app node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
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

# De fora, pelo Caddy: a propriedade que mais importa da superficie publica e o login na frente de tudo, e ela e
# conferida AQUI, com falha de verdade (antes so se imprimia o codigo, e um 200 passava como "No ar"). O Tinyauth
# responde 401 a quem nao e navegador (curl) e redireciona (302) quem e.
#   - /produtos sem login: 401;  com um Remote-User forjado: 401 (o cabecalho nao pode abrir nada);
#   - uma foto que nao existe, no formato exato: 404 (a rota publica esta de pe e o app respondeu);
#   - o mesmo caminho por POST: 401 (so GET e HEAD sao publicos);
#   - um nome fora do formato do sistema: 401 (cai no ramo com login);
#   - a pasta da reserva: 401 (so a tela, que tem login, a usa).
PASSO="conferindo o login de fora"
URL="https://rise.4hobby.com.br"
FOTO="/api/arquivos/deploy-teste/imagens/00000000000000000000000000000000.jpg"
codigo() { curl -s -o /dev/null -m 15 -w '%{http_code}' "$@" || true; }
PUBLICO="$(codigo "${URL}/produtos")"
FORJADO="$(codigo -H 'Remote-User: Maicol' "${URL}/produtos")"
FOTO_PUBLICA="$(codigo "${URL}${FOTO}")"
FOTO_POST="$(codigo -X POST "${URL}${FOTO}")"
FOTO_FORA="$(codigo "${URL}/api/arquivos/deploy-teste/imagens/qualquer.jpg")"
RESERVA="$(codigo "${URL}/api/arquivos/deploy-teste/reserva/00000000000000000000000000000000.jpg")"
echo "== De fora: /produtos ${PUBLICO} (401) | Remote-User forjado ${FORJADO} (401) | foto publica ${FOTO_PUBLICA} (404) | POST ${FOTO_POST} (401) | nome fora do formato ${FOTO_FORA} (401) | reserva ${RESERVA} (401)"
if [ "${PUBLICO}" != 401 ] || [ "${FORJADO}" != 401 ] || [ "${FOTO_PUBLICA}" != 404 ] || [ "${FOTO_POST}" != 401 ] || [ "${FOTO_FORA}" != 401 ] || [ "${RESERVA}" != 401 ]; then
  echo "A superficie publica nao esta como deveria (linha acima): o login pode estar aberto. NAO e um deploy valido."
  false
fi

# Passou em tudo: esta imagem passa a ser a "boa" que o proximo deploy guarda como rise:anterior.
PASSO="registrando o deploy"
docker image tag rise:latest rise:bom
git tag -f "vps-${VERSAO}" >/dev/null
# Os logs do HOST (deploy.log, cron.log) moram em ~/logs, fora de dados/: o conteiner roda como root e escreve em
# dados/, entao quem o controlasse trocaria um arquivo dali por um link e faria um `>>` do host escrever onde nao deve.
mkdir -p "${HOME}/logs"
echo "${VERSAO} ${COMMIT}" >> "${HOME}/logs/deploy.log"

# O crontab versionado e a fonte unica das rotinas (backup, copia externa, limpeza de logs); sem reinstala-lo aqui,
# uma mudanca nele ficava no git e nunca chegava ao cron.
PASSO="instalando o crontab"
# O deploy ja esta no ar, conferido e registrado: falha aqui e AVISO. Como erro, a trap diria "o deploy parou" e
# mandaria voltar a imagem de um deploy que esta bom.
if ! crontab deploy/crontab; then
  echo "AVISO: o crontab NAO foi reinstalado (deploy/crontab invalido?). O deploy esta no ar; as rotinas seguem com o crontab de antes."
fi

# Limpeza do Docker (pedido do dono em 27/10/2026): o cache de montagem e as imagens sem nome se acumulavam a cada
# deploy e encheram o disco (57 GB de cache e 36 GB de imagens; o deploy 27.10.2026.41 parou com "no space left").
# Fica o cache dos ultimos 7 dias, para o proximo envio continuar rapido; rise:latest, rise:bom e rise:anterior tem
# nome e nunca saem. Falha aqui e AVISO: o deploy ja esta no ar.
PASSO="limpando o cache do Docker"
if ! docker builder prune -f --filter "until=168h" >/dev/null || ! docker image prune -f >/dev/null; then
  echo "AVISO: a limpeza do cache do Docker falhou. O deploy esta no ar; confira o disco com 'df -h /'."
fi
echo "== Disco: $(df -h / | awk 'NR==2 {print $4 " livres de " $2}')"

docker compose ps
echo "== No ar: Versao ${VERSAO} (commit ${COMMIT})"
