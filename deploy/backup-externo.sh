#!/usr/bin/env bash
# Camada 2 do backup na VPS: copia para fora (Cloudflare R2), cron as 03:30, depois do backup das 03:00.
#   - o dump do dia vai para banco/diario (guarda 30 dias) e, no dia 1, tambem para banco/mensal (12 meses):
#     o historico das fotos mensais de preco sobrevive a um disco perdido;
#   - dados/produtos e dados/coleta sao espelhados; o que foi apagado ou trocado aqui vai para apagados/<data>
#     no R2 e fica 30 dias, para uma exclusao por engano nao sumir tambem da copia.
set -euo pipefail
cd "$(dirname "$0")/.."

ler_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }
REMOTO="$(ler_env RCLONE_REMOTO)"
AVISO="$(ler_env HEALTHCHECKS_COPIA_URL)"
BANCO="$(ler_env POSTGRES_DB)"
BANCO="${BANCO:-sistema_rise}"

avisar() { [ -n "${AVISO}" ] && curl -fsS -m 10 --retry 3 "${AVISO}$1" >/dev/null || true; }
trap 'echo "COPIA EXTERNA FALHOU ($(date))"; avisar /fail' ERR

[ -n "${REMOTO}" ] || { echo "RCLONE_REMOTO vazio no .env"; false; }

# So o backup AUTOMATICO (nome <banco>-AAAAMMDD-HHMMSS.dump); a copia de seguranca da copia:atualizar fica.
DUMP="$(ls dados/backup | grep -E "^${BANCO}-[0-9]{8}-[0-9]{6}\.dump$" | sort | tail -1 || true)"
[ -n "${DUMP}" ] || { echo "Nenhum backup automatico em dados/backup"; false; }
# Mandar o de ontem de novo pareceria sucesso com o backup das 03:00 quebrado. 26 h de folga.
[ -n "$(find "dados/backup/${DUMP}" -mmin -1560)" ] || { echo "O backup mais novo (${DUMP}) tem mais de 26 h"; false; }

echo "== Copia externa $(date): ${DUMP}"
rclone copyto "dados/backup/${DUMP}" "${REMOTO}/banco/diario/${DUMP}"
if [ "$(TZ=America/Sao_Paulo date +%d)" = "01" ]; then
  rclone copyto "dados/backup/${DUMP}" "${REMOTO}/banco/mensal/${DUMP}"
fi
rclone delete --min-age 30d "${REMOTO}/banco/diario"
rclone delete --min-age 370d "${REMOTO}/banco/mensal"

HOJE="$(TZ=America/Sao_Paulo date +%Y%m%d)"
for PASTA in produtos coleta; do
  rclone sync "dados/${PASTA}" "${REMOTO}/${PASTA}" --backup-dir "${REMOTO}/apagados/${HOJE}/${PASTA}"
done
rclone delete --min-age 30d "${REMOTO}/apagados"
rclone rmdirs --leave-root "${REMOTO}/apagados"

avisar ""
echo "== Copia externa concluida"
