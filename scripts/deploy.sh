#!/usr/bin/env bash
# Primer despliegue (o re-levantado) del contenedor. Idempotente.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
echo "→ Levantando Emma & Papá…"
docker compose up -d
sleep 2
./scripts/health-check.sh
echo "→ Listo. Recuerda el vhost del host y el SSL (ver DEPLOY.md)."
