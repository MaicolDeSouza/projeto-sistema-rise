#!/usr/bin/env bash
# Camada 2 do backup na VPS: copia para fora (Cloudflare R2), cron as 03:30, depois do backup das 03:00.
#   - o dump do dia vai para banco/diario (guarda 30 dias) e, uma vez por MES, tambem para banco/mensal (12
#     meses): o historico das fotos mensais de preco sobrevive a um disco perdido;
#   - dados/produtos e dados/coleta sao espelhados; o que foi apagado ou trocado aqui vai para apagados/<data>
#     no R2 e fica 30 dias, para uma exclusao por engano nao sumir tambem da copia.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/lib.sh

REMOTO="$(ler_env RCLONE_REMOTO)"
AVISO="$(ler_env HEALTHCHECKS_COPIA_URL)"
BANCO="$(ler_env POSTGRES_DB)"
BANCO="${BANCO:-sistema_rise}"

trap 'echo "COPIA EXTERNA FALHOU ($(date))"; avisar /fail' ERR

[ -n "${REMOTO}" ] || { echo "RCLONE_REMOTO vazio no .env"; false; }

# So o backup AUTOMATICO (nome <banco>-AAAAMMDD-HHMMSS.dump); a copia de seguranca da copia:atualizar fica.
DUMP="$(ls dados/backup | grep -E "^${BANCO}-[0-9]{8}-[0-9]{6}\.dump$" | sort | tail -1 || true)"
[ -n "${DUMP}" ] || { echo "Nenhum backup automatico em dados/backup"; false; }
# Mandar o de ontem de novo pareceria sucesso com o backup das 03:00 quebrado. 26 h de folga.
[ -n "$(find "dados/backup/${DUMP}" -mmin -1560)" ] || { echo "O backup mais novo (${DUMP}) tem mais de 26 h"; false; }

echo "== Copia externa $(date): ${DUMP}"
rclone copyto "dados/backup/${DUMP}" "${REMOTO}/banco/diario/${DUMP}"

# Copia mensal: a PRIMEIRA do mes que der certo, e nao so a do dia 1. Se a copia do dia 1 falha e e refeita no dia
# 2, o mes inteiro ficava sem copia mensal. O nome do dump carrega a data, entao o mes e o prefixo. A lista vai
# para uma variavel (e nao para um pipe com `grep -q`): com `pipefail`, o grep que sai cedo mata o rclone com
# SIGPIPE e o `if` copiaria todo dia.
MES="$(TZ=America/Sao_Paulo date +%Y%m)"
LISTA_MENSAL="$(rclone lsf "${REMOTO}/banco/mensal" 2>/dev/null || true)"
if ! grep -q "^${BANCO}-${MES}" <<<"${LISTA_MENSAL}"; then
  rclone copyto "dados/backup/${DUMP}" "${REMOTO}/banco/mensal/${DUMP}"
fi

rclone delete --min-age 30d "${REMOTO}/banco/diario"
rclone delete --min-age 370d "${REMOTO}/banco/mensal"

HOJE="$(TZ=America/Sao_Paulo date +%Y%m%d)"
for PASTA in produtos coleta; do
  rclone sync "dados/${PASTA}" "${REMOTO}/${PASTA}" --backup-dir "${REMOTO}/apagados/${HOJE}/${PASTA}"
done

# apagados/<AAAAMMDD>: cada pasta guarda o que foi apagado ou trocado AQUI naquele dia. Sai quando a PASTA tem mais
# de 30 dias, e NAO por `--min-age`: o --backup-dir preserva a data de modificacao do ARQUIVO (a de quando ele foi
# gravado), entao uma foto de agosto apagada hoje ja teria mais de 30 dias e sairia do R2 no mesmo minuto, e a
# promessa de 30 dias para desfazer uma exclusao nao valeria para quase nada.
LIMITE="$(TZ=America/Sao_Paulo date -d '30 days ago' +%Y%m%d)"
for DIA in $(rclone lsf --dirs-only "${REMOTO}/apagados" 2>/dev/null | tr -d '/' || true); do
  if [[ "${DIA}" =~ ^[0-9]{8}$ ]] && [ "${DIA}" -lt "${LIMITE}" ]; then
    rclone purge "${REMOTO}/apagados/${DIA}"
  fi
done

avisar ""
echo "== Copia externa concluida"
