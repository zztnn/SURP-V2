#!/bin/bash
# Start SURP API (NestJS HTTP) — build + run compiled output (no watch).
#
# Patrón portado de ERP/dev-api.sh. Para recargar cambios, re-ejecutar
# el script (no hay watch mode — más estable y menos memoria que
# `nest start --watch`).
#
# Uso:
#   ./dev-api.sh              # build + run en puerto 3201
#   ./dev-api.sh --skip-build # reutiliza dist/ existente (arranque rápido)
#   PORT=3299 ./dev-api.sh    # override puerto
#
# Prereqs:
#   - Docker corriendo: postgres + redis + mailhog (`pnpm db:up`).
#   - apps/api/.env con DATABASE_URL, JWT_SECRET, REDIS_*, SMTP_*.
#
# Logs: /tmp/surp-api.log
set -euo pipefail

cd "$(dirname "$0")/apps/api"

SKIP_BUILD=0
if [ "${1:-}" = "--skip-build" ]; then
  SKIP_BUILD=1
fi

PORT=${PORT:-3201}

# Matar cualquier proceso en el puerto (incluye watchers huérfanos).
PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "Matando proceso(s) en puerto $PORT: $PIDS"
  # shellcheck disable=SC2086
  kill -9 $PIDS 2>/dev/null || true
  sleep 0.5
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "Build..."
  pnpm build || { echo "Build falló"; exit 1; }
fi

echo "Arrancando @surp/api en puerto $PORT..."
echo "Log: /tmp/surp-api.log"
echo "NOTA: sin watch mode — re-ejecutar ./dev-api.sh para recargar."
FORCE_COLOR=1 PORT="$PORT" node --env-file=.env --enable-source-maps dist/main.js \
  2>&1 | tee /tmp/surp-api.log
