#!/usr/bin/env bash
# Logs do worker (um por dia) com mais de 30 dias saem: sem isto a pasta cresce para sempre no disco da VPS.
# O backup.log, o deploy.log e o cron.log sao um arquivo so cada, escritos todo dia, e ficam.
set -euo pipefail
cd "$(dirname "$0")/.."
find dados/logs -maxdepth 1 -name 'worker-*.log' -mtime +30 -print -delete
