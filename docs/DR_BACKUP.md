# Continuidad (DR) y Backups — Comptrol‑MEF

Este documento define el mínimo de continuidad para producción. Completar los placeholders institucionales antes del go‑live.

## 1) Objetivos (RPO/RTO)
- **RPO (máxima pérdida de datos)**: ____ (ej. 24h / 4h / 15min).
- **RTO (máximo tiempo de recuperación)**: ____ (ej. 8h / 2h).
- **Entornos**: QA ____ / Prod ____.

## 2) Qué se respalda
- **Base de datos PostgreSQL** (obligatorio).
- **Configuración** (sin secretos en claro): manifiesto de variables por entorno.
- **Artefactos**: imágenes/paquetes desplegados (para rollback).
- **Documentación operativa**: runbooks, diagramas, inventario de endpoints.

## 3) Estrategias de backup (PostgreSQL)
Elegir una según la plataforma (on‑prem/cloud) y el RPO requerido:

### Opción A — `pg_dump` (simple, RPO alto)
- Frecuencia: diaria (o más).
- Retención: __ días.
- Pros: simple.
- Contras: restauración más lenta; no cubre RPO bajo.

### Opción B — Backup completo + WAL/archiving (RPO bajo)
- Frecuencia: full semanal + incremental/WAL continuo.
- Requiere: configuración de archive/WAL y almacenamiento seguro.

## 4) Restore test (obligatorio)
- Frecuencia: mensual (o según política).
- Evidencias mínimas:
  - fecha/hora
  - versión del dump/backup
  - tiempo de restore (cumple RTO)
  - verificación funcional (health ready + login + métricas dashboard)

## 5) Procedimiento de restauración (base)
Pasos genéricos (ajustar a la plataforma real):
1. Aprobar ventana de recuperación (cambio/emergencia).
2. Aislar el servicio (evitar escrituras).
3. Provisionar DB destino (versión compatible).
4. Restaurar backup:
   - `pg_restore` o `psql < dump.sql` según formato.
5. Aplicar migraciones compatibles (si aplica).
6. Validar:
   - `GET /api/v1/health/ready`
   - Login + dashboard
7. Rehabilitar tráfico.
8. Documentar evidencias y RCA si fue incidente.

## 6) Seguridad de backups
- Cifrado en reposo y en tránsito.
- Control de acceso (mínimo privilegio).
- Rotación y borrado seguro según retención.

