#!/usr/bin/env bash
# Verifica que el sitio responde y reporta la versión del service worker.
set -Eeuo pipefail
PORT="${APP_PORT:-8140}"
URL="http://127.0.0.1:${PORT}"
code=$(curl -fsS -o /dev/null -w "%{http_code}" "$URL/index.html")
echo "index.html   → HTTP $code"
ver=$(curl -fsS "$URL/service-worker.js" | grep -oE "emma-v[0-9]+" | head -1 || true)
echo "service-worker → ${ver:-desconocido}"
[ "$code" = "200" ] || { echo "✗ health-check falló"; exit 1; }
echo "✓ OK"
