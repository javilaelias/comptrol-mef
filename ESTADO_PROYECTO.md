# ESTADO — Comptrol-MEF

ITAM/CMDB del MEF (inventario de activos de TI). Integrado al portal OPDA Apps (`gti-app`) con
SSO real (`login_mode='SSO_TICKET'`) y rol dedicado `ROLE_COMPTROL`. Fuente de verdad de
despliegue: `docker-compose.server.yml` (producción, `/home/usr_admin/apps/Comptrol/` en
`10.118.67.55`) — distinto de `docker-compose.yml` (solo desarrollo local, no se despliega).

## Bloques

| Bloque | Estado | Detalle |
|---|---|---|
| SSO real + rol dedicado (`ROLE_COMPTROL`) | ✅ Cerrado 2026-09-22 | Ver `registro/gti-app.md` de JuvinFactory — implementado en el repo de `gti-app`, no en este |
| Carga del patrimonio de SIGA a staging | ✅ Cerrado 2026-09-23 | `openspec/changes/archive/cargar-patrimonio-siga-staging/` |

## Carga de SIGA (2026-09-23)

34,169 activos reales del MEF (corte SIGA 15/07/2026, solo equipos de TI) cargados en la base
real de staging vía `npm run import:siga`, sin mover el dump de 5.9 GB — acceso por túnel SSH a
un puerto nuevo (`127.0.0.1:5437:5432`, agregado a `docker-compose.server.yml`, servicio `db`).
Detalle completo en `openspec/changes/archive/cargar-patrimonio-siga-staging/` (concilio 5
revisores + seguridad, APROBADO CON CAMBIOS).

**Resultado real verificado en la base** (no solo el resumen del script):
- `assets` por `source`: `api_import` = 34,169 (el import) · `manual` = 2,743 · `discovery_active`
  = 457 — **3,200 activos preexistentes de antes de este import, no tocados**. Total real:
  37,369.
- Sedes: 10 · Dependencias: 63 nuevas · Ubicaciones: 1,412 nuevas · Responsables (usuarios
  inactivos `siga-*@siga.local`): 3,245.
- Tenant `mef` verificado como el mismo que usan los usuarios reales del SSO (una sola fila en
  `tenants`, no se creó ninguno separado).

**Ver `docs/IMPORTACION_SIGA.md`** para las tres decisiones de importación (solo TI, bajas
incluidas, tipo `other` para periféricos) — los números de ese doc son de la corrida LOCAL de
desarrollo (34,207 activos, base ya con datos previos del Excel), distintos de los de staging
arriba por partir de una base con contenido distinto, no por un error.

**Deuda encontrada, no resuelta en este cambio:**
- `docker-compose.server.yml` del repo estaba desincronizado de lo que corre en producción antes
  de este cambio (puerto web `8092` en el servidor vs `3000` en el repo, paso `prisma db seed`
  presente en el servidor y ausente en el repo, `npm ci --include=dev` vs `npm install`). Se
  preservó tal cual al hacer el cambio quirúrgico del puerto de `db` — no se corrigió el resto
  del drift, queda como housekeeping aparte.
- `POSTGRES_PASSWORD=postgres` (base de datos) sigue siendo la contraseña por defecto, ahora
  alcanzable por túnel SSH — deuda de rotación pendiente, igual que
  `LDAP_BIND_PASSWORD`/`AUTH_JWT_SECRET` de `gti-app`.
- Puerto `127.0.0.1:5437:5432` queda publicado permanentemente (decisión de diseño, ver
  `design.md` del cambio archivado) para no repetir este mini-bloque de infraestructura en el
  próximo re-sync de SIGA.

## Pendiente (próximo mini-bloque, pedido directo del usuario)

UI de la lista de activos: (1) indicar visualmente que el dato viene de SIGA, (2) columnas
configurables (visibles/ocultas) con scroll horizontal para las ocultas. Sin propuesta OpenSpec
todavía — pasa por su propio concilio antes de codificar, no se mezcla con el cambio de carga de
datos ya cerrado.
