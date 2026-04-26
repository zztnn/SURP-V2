#!/bin/bash
# Start SURP Worker (NestJS BullMQ — WORKER_MODE=true).
#
# Misma imagen / código que la API, pero arrancando WorkerModule en lugar
# de AppModule HTTP. NO escucha HTTP; consume jobs de BullMQ desde Redis.
# Diferenciador respecto al ERP: SURP es dual-mode (api + worker) por
# diseño (ver STACK.md §5).
#
# Uso:
#   ./dev-worker.sh              # build + run
#   ./dev-worker.sh --skip-build # reutiliza dist/
#
# Prereqs:
#   - Docker corriendo: postgres + redis + mailhog.
#   - dev-api.sh idealmente ya levantado (encolará jobs).
#
# Logs: /tmp/surp-worker.log
set -euo pipefail

cd "$(dirname "$0")/apps/api"

SKIP_BUILD=0
if [ "${1:-}" = "--skip-build" ]; then
  SKIP_BUILD=1
fi

# El worker NO escucha HTTP — no hay puerto que matar. Pero sí matamos
# cualquier worker huérfano que haya quedado vivo (BullMQ Worker se
# conecta a Redis y consume jobs aunque no tenga puerto).
WORKER_PIDS=$(pgrep -f 'WORKER_MODE=true.*node.*dist/main.js' 2>/dev/null || true)
if [ -n "$WORKER_PIDS" ]; then
  echo "Matando worker(s) huérfano(s): $WORKER_PIDS"
  # shellcheck disable=SC2086
  kill -9 $WORKER_PIDS 2>/dev/null || true
  sleep 0.5
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "Build..."
  pnpm build || { echo "Build falló"; exit 1; }
fi

echo "Arrancando @surp/api en modo WORKER (BullMQ)..."
echo "Log: /tmp/surp-worker.log"
echo "NOTA: sin watch mode — re-ejecutar ./dev-worker.sh para recargar."
FORCE_COLOR=1 WORKER_MODE=true node --env-file=.env --enable-source-maps dist/main.js \
  2>&1 | tee /tmp/surp-worker.log
