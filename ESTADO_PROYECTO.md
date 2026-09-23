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
| Columnas configurables + origen SIGA en Activos | 🟡 Desplegado a staging, falta verificación visual del usuario | `openspec/changes/activos-columnas-configurables-origen-siga/` (sin archivar todavía) |
| Retirar tabs "Apps" y "ENAD" del menú | ✅ Cerrado 2026-09-23 | Ver sección abajo |

## Retirar "Apps" y "ENAD" del menú (2026-09-23)

Pedido directo del usuario tras probar el portal: el tab "Apps" (`/applications`, catálogo de
aplicaciones ENAD/MEF) nunca tuvo un importador ni alta manual — está vacío desde que se creó,
funcionalidad a medio construir. El tab "ENAD" (`/enad`) es solo el importador/configurador de la
encuesta 2025 (correr el script + responder 2 preguntas manuales); el resumen que sí se usa a
diario (PCs, laptops, tablets, disponibilidad) ya vive en el Dashboard vía `EnadSummaryPanel`,
independiente de este tab.

Decisión (confirmada con el usuario, sin concilio propio — mismo patrón mecánico de retiro de tab
del nav ya usado en `gti-app` para QAOPDA): quitar ambos del menú (`TopNav.tsx`), **sin borrar
código**. Las rutas `/applications` y `/enad` siguen funcionando por URL directa — `/enad` queda
lista para cuando el MEF publique la encuesta 2026 (mismo importador, sin tocar nada); `/applications`
queda como base para si algún día se decide construir el importador real de ese catálogo.

`tsc --noEmit` limpio. Sin cambios de backend ni de datos — el histórico ENAD 2025 no se toca.

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

## Columnas configurables + origen SIGA en Activos (2026-09-23, implementado, no archivado)

Pedido directo del usuario tras ver los datos de SIGA cargados: (1) indicador de origen SIGA en
la lista y el detalle de cada activo, (2) selector de columnas visibles (de ~30 campos posibles,
antes solo 6 fijos) con scroll horizontal para las que no entran en pantalla.

Propuesta OpenSpec + concilio (2 revisores + los dos sub-veredictos de arquitectura explícitos,
APROBADO CON CAMBIOS) — dos correcciones reales encontradas antes de codificar:
- **Seguridad:** el diseño original pedía `include: { owner: true }` en el listado de activos —
  eso habría filtrado `passwordHash` en la respuesta HTTP (`assets.controller.ts` no tiene
  ningún sanitizado/interceptor). Corregido a `select` explícito
  (`id`/`fullName`/`email`), verificado con una consulta real contra la base local que confirma
  que `passwordHash` no viaja. **El mismo problema ya existe hoy en `getById`/`getByAssetTag`
  (detalle de un activo) — deuda de seguridad real, no corregida en este cambio, pendiente como
  ítem propio.**
- **Simplicidad:** se descartó `@tanstack/react-table` (propuesta original) — el pedido no
  necesita sorting/filtering/virtualización, solo toggle de visibilidad. Implementado con
  `useState<Record<string, boolean>>`, mismo patrón que ya usaba el archivo, sin dependencias
  nuevas.

**Implementado:** `apps/web/src/app/assets/columns.tsx` (30 columnas en 6 grupos), `apps/web/src/
lib/assetOrigin.ts` (`isSigaImported`, por `fingerprint`, no por `source` — más preciso, ver
`design.md`), tabla y selector en `page.tsx`, badge en `[id]/page.tsx`, `owner` agregado al
listado del backend. `tsc --noEmit` y `next build` limpios.

**Desplegado a staging 2026-09-23** (`970f561`, push autorizado por el usuario): mismo patrón
mecánico de `git archive` limpio + backup con timestamp (`apps/api.bak.20260923-085217`,
`apps/web.bak.20260923-085217`) + extracción sobre el bind mount + `docker restart` ya usado en
despliegues anteriores. `.env.docker` verificado intacto por checksum antes/después. Los 3
contenedores (`comptrol-postgres`, `comptrol-api`, `comptrol-web`) quedaron `healthy`, `curl -I`
a `comptrol-web` responde 307 (redirect a login, igual que antes del cambio).

**Pendiente, no cubierto por esta sesión:** verificación visual en navegador real (esta sesión no
tiene acceso a un navegador interactivo) — falta confirmar que el selector, el scroll horizontal
y el badge se ven y funcionan como se espera, esta vez con la sesión propia del usuario en
staging. **El cambio OpenSpec sigue abierto (no archivado) hasta esa confirmación.**
