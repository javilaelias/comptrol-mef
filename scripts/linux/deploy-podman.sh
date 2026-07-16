#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/gti-app/src/Comptrol-MEF}"
RUNTIME_ROOT="${RUNTIME_ROOT:-/opt/gti-app/runtime}"
WEB_RUNTIME="$RUNTIME_ROOT/comptrol-web"

cd "$APP_ROOT"

mkdir -p "$WEB_RUNTIME/node_modules" "$WEB_RUNTIME/npm-cache"

if [[ ! -f apps/api/.env.docker ]]; then
  echo "Missing $APP_ROOT/apps/api/.env.docker" >&2
  exit 1
fi

podman network exists comptrol-net || podman network create comptrol-net
podman volume exists comptrol_pgdata || podman volume create comptrol_pgdata
podman volume exists comptrol_api_node_modules || podman volume create comptrol_api_node_modules

podman pull docker.io/library/postgres:15
podman pull docker.io/library/node:20

podman rm -f comptrol-import-docs comptrol-web comptrol-api comptrol-postgres >/dev/null 2>&1 || true

podman run -d \
  --name comptrol-postgres \
  --network comptrol-net \
  --network-alias db \
  --restart unless-stopped \
  -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=comptrol \
  -v comptrol_pgdata:/var/lib/postgresql/data \
  docker.io/library/postgres:15

for _ in $(seq 1 30); do
  if podman exec comptrol-postgres pg_isready -U postgres -d comptrol >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

podman exec comptrol-postgres pg_isready -U postgres -d comptrol >/dev/null

podman run --rm \
  --name comptrol-bootstrap \
  --network comptrol-net \
  --env-file "$APP_ROOT/apps/api/.env.docker" \
  -e NODE_ENV=production \
  -v "$APP_ROOT/apps/api:/app:Z" \
  -v comptrol_api_node_modules:/app/node_modules \
  -w /app \
  docker.io/library/node:20 \
  sh -lc 'set -e; test -x node_modules/.bin/nest || npm ci --include=dev; npx prisma generate; npx prisma migrate deploy; npm run build; npm run db:seed'

podman run --rm \
  --name comptrol-import-docs \
  --network comptrol-net \
  --env-file "$APP_ROOT/apps/api/.env.docker" \
  -e DOCS_DIR=/repo/docs \
  -v "$APP_ROOT:/repo:Z" \
  -v comptrol_api_node_modules:/repo/apps/api/node_modules \
  -v "$APP_ROOT/apps/importer/node_modules:/repo/apps/importer/node_modules:Z" \
  -w /repo \
  docker.io/library/node:20 \
  sh -lc 'set -e; test -d node_modules || npm ci; npm run import:docs'

podman run -d \
  --name comptrol-api \
  --network comptrol-net \
  --restart unless-stopped \
  -p 127.0.0.1:3001:3001 \
  --env-file "$APP_ROOT/apps/api/.env.docker" \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -v "$APP_ROOT/apps/api:/app:Z" \
  -v comptrol_api_node_modules:/app/node_modules \
  -w /app \
  docker.io/library/node:20 \
  sh -lc 'set -e; npx prisma generate; npm run build; npm run start:prod'

podman run -d \
  --name comptrol-web \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_API_BASE_URL=/api/v1 \
  -e API_PROXY_TARGET=http://127.0.0.1:3001 \
  -v "$APP_ROOT/apps/web:/app:Z" \
  -v "$WEB_RUNTIME/node_modules:/app/node_modules:Z" \
  -v "$WEB_RUNTIME/npm-cache:/opt/gti-app/runtime/comptrol-web/npm-cache:Z" \
  -w /app \
  docker.io/library/node:20 \
  sh -lc 'set -e; test -x node_modules/.bin/next || npm install --cache /opt/gti-app/runtime/comptrol-web/npm-cache; npm run build; npm run start -- --hostname 0.0.0.0 --port 3000'

echo "Comptrol deployed."
podman ps --format '{{.Names}}|{{.Status}}|{{.Ports}}'
