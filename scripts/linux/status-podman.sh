#!/usr/bin/env bash
set -euo pipefail

echo "== Containers =="
podman ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo
echo "== Health =="
curl -fsS http://127.0.0.1:3001/api/v1/health/ready
echo
curl -I -s http://127.0.0.1/ | sed -n '1,10p'

echo
echo "== Logs: API =="
podman logs --tail 40 comptrol-api || true

echo
echo "== Logs: WEB =="
podman logs --tail 40 comptrol-web || true
