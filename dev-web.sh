#!/bin/bash
# Start SURP Web (Next.js) con log de salida para debugging.
#
# Patrón portado de ERP/dev-web.sh. A diferencia del backend, SÍ usa
# watch mode nativo de Next (Turbopack) — recarga automática on save.
#
# Uso:
#   ./dev-web.sh           # arranca en puerto 3200
#   PORT=3299 ./dev-web.sh # override puerto
#
# Prereqs:
#   - dev-api.sh corriendo (o backend accesible en el host configurado).
#   - apps/web/.env.local con NEXT_PUBLIC_API_URL=http://localhost:3201
#     (apunta al puerto del backend).
#
# Logs: /tmp/surp-web.log
set -euo pipefail

PORT=${PORT:-3200}
cd "$(dirname "$0")/apps/web"

# Matar cualquier proceso en el puerto (Turbopack a veces deja huérfanos
# tras Ctrl+C abrupto).
PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "Matando proceso(s) en puerto $PORT: $PIDS"
  # shellcheck disable=SC2086
  kill -9 $PIDS 2>/dev/null || true
  sleep 0.5
fi

echo "Arrancando @surp/web (Next.js + Turbopack) en puerto $PORT..."
echo "Log: /tmp/surp-web.log"
FORCE_COLOR=1 PORT="$PORT" pnpm dev 2>&1 | tee /tmp/surp-web.log
