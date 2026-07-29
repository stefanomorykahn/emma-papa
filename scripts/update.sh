#!/usr/bin/env bash
# Actualiza el sitio: trae los últimos cambios de git. Los archivos son bind-mount,
# así que se sirven al instante; solo aseguramos que el contenedor siga arriba.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
echo "→ git pull…"
git pull --ff-only
docker compose up -d
./scripts/health-check.sh
