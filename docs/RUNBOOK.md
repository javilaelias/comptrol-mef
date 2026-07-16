# Runbook — Comptrol‑MEF

Runbook operativo (N1/N2) para diagnóstico y acciones estándar. Los comandos asumen Windows en la raíz del repo.

## 0) URLs y health
- Web: `http://localhost:3000`
- API: `http://localhost:3001/api/v1`
- Live: `GET /api/v1/health/live`
- Ready (incluye DB): `GET /api/v1/health/ready`

## 1) La web no abre (HTTP 5xx/timeout)
1. Verificar API ready:
   - `curl http://localhost:3001/api/v1/health/ready`
2. Verificar contenedores:
   - `docker compose ps`
   - `docker compose logs -f web`
3. Acciones estándar:
   - Reiniciar web: `docker compose restart web`
   - Si depende de API: seguir sección 2.

## 2) API no responde / falla health ready
1. Ver logs:
   - `docker compose logs -f api`
2. Verificar DB:
   - `docker compose logs -f db`
   - `docker compose exec -T db pg_isready -U postgres -d comptrol`
3. Acciones estándar:
   - Reiniciar API: `docker compose restart api`
   - Reiniciar stack (dev): `comptrol.bat down` y luego `comptrol.bat up`

## 3) DB no levanta
1. Verificar estado:
   - `docker compose ps db`
   - `docker compose logs -f db`
2. Acción estándar:
   - `comptrol.bat db reset` (ATENCIÓN: recrea volumen en dev)

## 4) Migraciones fallan
1. Confirmar que la DB está lista:
   - `docker compose exec -T db pg_isready -U postgres -d comptrol`
2. Ejecutar migración en contenedor API (dev):
   - `docker compose --profile app run --rm api sh -lc "npx prisma generate; npx prisma migrate deploy"`
3. Si persiste:
   - Escalar a N3 con logs + hash de migración + error completo.

## 5) Error de autenticación / SSO
Checklist:
- Validar configuración de `JWT_SECRET` / integración IdP (cuando se integre en `gti-app`).
- Revisar reloj del sistema (tokens expiran).
- Revisar logs de API (auth).
Acción:
- Escalar a Seguridad/IAM si hay falla de IdP.

## 6) Lentitud (p95 alto) / timeouts
Checklist rápido:
- ¿CPU/RAM saturada en host?
- ¿DB con demasiadas conexiones?
- ¿endpoint específico?
Acciones:
- Capturar evidencias: logs + endpoint + hora + volumen.
- Reinicio controlado (si aplica): `docker compose restart api`
- Escalar a N3 si se repite o si hay crecimiento de tablas/índices faltantes.

## 7) Carga inicial (one‑shot) — Import Excel
Solo para migración inicial / data seeding (no operación recurrente).
- Import: `comptrol.bat job docs`
- Reset + import: `comptrol.bat job docs reset`

