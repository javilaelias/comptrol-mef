# Operación (Institucional) — Comptrol‑MEF

Este documento define el “mínimo operativo” para operar Comptrol‑MEF como servicio (integrado al portal GTI) en entornos institucionales.

## 1) Alcance del servicio
- **Producto**: ITAM/CMDB (inventario, licencias, apps, reportes).
- **Componentes**: Web (Next.js), API (NestJS), DB (PostgreSQL), Agente (Windows .exe).
- **Carga inicial**: importación Excel/PDF es **one‑shot** (herramienta de migración). Post go‑live se deshabilita el job y se opera por UI/API/agente.

## 2) Roles y RACI (mínimo)
- **Service Owner (Negocio/GTI)**: prioriza, acepta cambios, define métricas de valor.
- **Product Owner / App Owner (TI)**: backlog, releases, coordinación con portal `gti-app`.
- **Operación N1**: monitoreo, atención primer nivel, reinicios controlados, evidencias.
- **Operación N2**: análisis de errores, performance, base de datos (sin cambios estructurales).
- **N3 / Dev**: correcciones de código, migraciones complejas, hotfix.
- **DBA**: backups/restore, tuning, políticas de retención.
- **Seguridad**: IAM/SSO, gestión de secretos, auditoría, hardening.

## 3) Objetivos de servicio (SLO sugeridos)
Definir SLO por entorno (QA/Prod) y revisarlos trimestralmente.

- **Disponibilidad API**: 99.5% mensual (excluye ventanas de mantenimiento).
- **Latencia API p95**: < 600 ms en `GET /dashboard/metrics`.
- **Errores 5xx**: < 0.5% de requests (rolling 30 días).
- **Login**: 99% de logins exitosos (excluye incidentes del IdP).

## 4) Observabilidad (mínimo obligatorio)
- **Logs**: estructurados (JSON), con `requestId`, `userId` (si aplica), `tenantId`, ruta, status, latencia.
- **Métricas**: tasa de requests, latencia (p50/p95/p99), 4xx/5xx, uso de CPU/RAM, pool de DB, conexiones.
- **Trazas**: si el stack del portal lo permite (OpenTelemetry).
- **Dashboards**: API health, DB health, errores top, endpoints top, p95 por endpoint.
- **Alertas**:
  - API down / healthcheck falla > 2 min
  - Error rate 5xx > umbral 5 min
  - Latencia p95 > umbral 10 min
  - DB: conexiones saturadas / storage / replicación (si aplica)

## 5) Gestión de configuración y secretos
- **Entornos**: `dev`, `qa`, `prod`.
- **Secretos**: fuera del repo (Vault/KeyVault/Secret Manager), rotación y control de acceso.
- **Configuración**: validada en arranque (fail‑fast). Mantener `.env.example` actualizados.

## 6) Gestión de cambios y despliegues
- **Pipeline**: build + tests + “gates” (QA → Prod).
- **Checklist de release**:
  - Migraciones listas y aprobadas
  - Backups recientes verificados
  - Plan de rollback documentado (código + DB)
  - Ventana de mantenimiento comunicada
  - Evidencias (tag, changelog, ticket)
- **Estrategia DB**: en Prod usar `prisma migrate deploy` (no `migrate dev`).

## 7) Continuidad (DR)
Ver `docs/DR_BACKUP.md` (RPO/RTO, backups, restore test).

## 8) Operación diaria/semanal (mínimo)
- Diario: revisar alertas, 5xx, latencia p95, capacidad DB.
- Semanal: revisar errores top, endpoints top, crecimiento de tablas, auditoría de accesos.
- Mensual: parcheo dependencias, revisión de vulnerabilidades, prueba de restore (si aplica por política).

## 9) Integración con portal `gti-app` (operación)
- Unificar **SSO/IAM** (IdP institucional).
- Publicación detrás de proxy/WAF del portal (subpath recomendado).
- Centralizar observabilidad (mismo stack de logs/metrics/traces).

