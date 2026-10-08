#!/usr/bin/env bash
# Camada 1 do backup na VPS: o `npm run backup` de sempre, rodado dentro do conteiner `app` (que tem o
# pg_dump 17). Cron as 03:00. Avisa o healthchecks.io no fim, com sucesso ou com falha: backup que falha em
# silencio so aparece no dia da perda.
set -euo pipefail
cd "$(dirname "$0")/.."

# Le uma variavel do .env sem `source`: o bcrypt do TINYAUTH_AUTH_USERS tem "$$", que o bash expandiria.
ler_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }
AVISO="$(ler_env HEALTHCHECKS_BACKUP_URL)"

avisar() { [ -n "${AVISO}" ] && curl -fsS -m 10 --retry 3 "${AVISO}$1" >/dev/null || true; }
trap 'echo "BACKUP DIARIO FALHOU ($(date))"; avisar /fail' ERR

echo "== Backup diario $(date)"
docker compose exec -T app npm run backup
avisar ""
