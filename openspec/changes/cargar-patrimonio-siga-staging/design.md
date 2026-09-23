## Context

Verificado contra el servidor real (SSH de solo lectura, `10.118.67.55`), no asumido:

- `docker inspect comptrol-postgres` → `{"5432/tcp":null}`: el contenedor real **no** publica
  ningún puerto al host. **Corregido tras revisión de concilio:** el archivo que realmente
  gobierna producción NO es `docker-compose.yml` (ese es solo de desarrollo local, ni existe en
  el servidor) — es `docker-compose.server.yml`, confirmado por
  `docker inspect comptrol-postgres --format '{{.Config.Labels}}'`
  (`com.docker.compose.project.working_dir=/home/usr_admin/apps/Comptrol`,
  `config_files=docker-compose.server.yml,docker-compose.override.yml`). Y
  `docker-compose.server.yml` (leído del repo real) **no tiene ningún bloque `ports:` para
  `db`** — coincide con lo que `docker inspect` muestra. El segundo archivo,
  `docker-compose.override.yml`, sí se usó al crear el contenedor (2026-08-19) pero **ya no
  existe en el servidor** (`ls /home/usr_admin/apps/Comptrol/` solo tiene
  `docker-compose.server.yml` y `.env`) — su contenido se perdió, no se puede saber qué agregaba.
  MB1-MB4 (bloque SSO recién cerrado) redesplegaron `api`/`web` pero **nunca tocaron `db`** a
  propósito (ver `qa-mb4.md`, "comptrol-postgres: no tocado").
- La fuente de SIGA (`SIGA_DATABASE_URL`) es hoy una base Postgres **local** (`localhost:5432/
  siga15072026`). El dato crudo detrás (`docs/siga_150726/`) pesa **12 GB**; el subconjunto más
  chico reutilizable (`docs/siga_150726/migracion/pg/`, SQL plano ya transformado desde Oracle)
  pesa **5.9 GB**. De referencia: el respaldo a Drive de este mismo cierre (1.55 GB) tardó más
  de una hora por la red institucional — mover 5.9 GB al servidor es horas, no minutos.
  **Conclusión: no vale la pena mover el dato fuente. Es mucho más barato mover la conexión.**

## Goals / Non-Goals

**Goals:**
- Que el import escriba contra la base REAL de staging sin transferir los 5.9 GB de SIGA.
- Verificar con dry-run antes de escribir, comparando contra los números ya documentados.

**Non-Goals:**
- No se toca el esquema (`prisma migrate`) — las tablas ya existen, el import solo hace
  `upsert`.
- No se re-arma la migración Oracle→Postgres de SIGA (`docs/siga_150726/migracion/`) — esa parte
  ya está hecha y verificada localmente, no se repite.
- No se toca `gti-app` ni el flujo SSO (bloque aparte, ya cerrado).

## Decisions

**D1 — Túnel SSH hacia `comptrol-postgres`, no mover el dump.**
**Corregido tras concilio:** esto NO es aplicar un mapeo ya declarado (ver Context) — es agregar
un bloque `ports:` **nuevo** al servicio `db` de `docker-compose.server.yml` (el archivo real de
producción), atado explícitamente a **loopback del servidor**:
```yaml
ports:
  - "127.0.0.1:5436:5432"
```
Nunca sin el prefijo `127.0.0.1:` — el formato sin prefijo (el que tenía por error el
`docker-compose.yml` de desarrollo) publica en todas las interfaces por defecto, no solo
loopback. El cambio se edita y commitea en el repo, se sincroniza al servidor con el mismo
patrón `git archive` + extraer encima ya usado en MB1 (bloque SSO), y se recrea SIEMPRE con `-f`
explícito: `docker compose -f docker-compose.server.yml up -d --force-recreate db` (nunca
`docker compose up` a secas — en ese directorio no hay `docker-compose.yml`, así que un comando
sin `-f` fallaría o, peor, se ejecutaría desde el directorio equivocado). Mismo volumen
(`comptrol_pgdata`), mismo `healthcheck` (`pg_isready`) ya definido — los datos no se tocan.

**Riesgo residual aceptado:** no se puede recuperar qué agregaba el `docker-compose.override.yml`
perdido. El servicio `db` en sí es simple (imagen oficial, env fijo, volumen nombrado,
healthcheck) — bajo riesgo de que el override cambiara algo crítico específico de ese servicio.

Desde la máquina local: `ssh -L 5436:127.0.0.1:5436 usr_admin@10.118.67.55` (mismo usuario/llave
ya usados en el bloque SSO), y `DATABASE_URL=postgresql://postgres:postgres@localhost:5436/
comptrol` para el import. `SIGA_DATABASE_URL` se queda apuntando a la base local — el dato fuente
nunca se mueve, solo cruzan el túnel los ~34 mil upserts resultantes (KB, no GB).

**Alternativas descartadas:**
- *Copiar el dump (5.9 GB) al servidor y correr el import ahí* (dentro de un contenedor con red
  al compose): descartado por tiempo — a la velocidad observada hoy (1.55 GB en más de 1h),
  serían varias horas solo de transferencia, antes de cargar el dump en Postgres (20-40 min más,
  según el propio script `03_cargar_postgres.ps1`).
- *Stream de `pg_dump` local vía SSH hacia un contenedor temporal en la red del compose*: mismo
  volumen de datos que copiar el archivo, sin ahorro real; más pasos y más superficie para un
  error a mitad de transferencia.

**D2 — Dry-run obligatorio contra el túnel antes de la corrida real.**
`SIGA_DRY_RUN=1 npm run import:siga` contra `DATABASE_URL` apuntando al túnel. Comparar el
resumen (`console.table` de ejemplos + conteos) contra los números ya documentados en
`docs/IMPORTACION_SIGA.md` (34,207 activos, 3,245 responsables, etc.) — si difieren
significativamente, DETENERSE y no correr la escritura real sin entender por qué (podría
significar que el tenant `mef` de staging ya tiene datos distintos a los que existían en la base
local cuando se escribió esa documentación).

**D3 — Tenant `mef` ya existe en staging, se reusa (no se crea uno nuevo).**
Verificado por código: `auth.service.ts:108` (`Comptrol-MEF/apps/api/src/modules/auth/
auth.service.ts`) hace `tenant.findFirst({ where: { slug: 'mef' } })` para el JIT provisioning
SSO — ya probado en producción hoy mismo (MB4 del bloque SSO, `qa-mb4.md`: "usuario
JIT-provisionado con role: employee"). El importador usa el mismo `TENANT_SLUG = 'mef'`
(`import-siga.ts:30`) — mismo tenant, no hay riesgo de crear uno separado y duplicar catálogos.

## Risks / Trade-offs

- **[Riesgo] Recrear el contenedor `db` interrumpe brevemente Postgres** (los usuarios que estén
  usando Comptrol-MEF en ese momento pierden la conexión unos segundos) → **Mitigación:**
  mismo volumen, mismo healthcheck ya probado; avisar al usuario antes de ejecutar el paso, y
  hacerlo en un momento sin uso activo si es posible (no es un ítem 24/7 crítico como gti-app).
- **[Riesgo] Dejar el puerto publicado permanentemente amplía la superficie** → **Mitigación:**
  atado a `127.0.0.1` del servidor, no a `0.0.0.0` — solo alcanzable vía túnel SSH con la misma
  llave que ya protege el resto del servidor. Es un cambio nuevo (ver D1 corregido), aceptado por
  concilio (lente de seguridad) precisamente porque queda en loopback y porque la documentación
  del importador dice explícitamente que se espera volver a correr `npm run import:siga` en el
  futuro (re-sync periódico de SIGA) — dejarlo disponible tiene uso real, no es una superficie
  que se abre y nunca se vuelve a usar. **Observación de seguridad no bloqueante (concilio):**
  `POSTGRES_PASSWORD=postgres` es una contraseña trivial preexistente (no introducida por este
  cambio) que se vuelve alcanzable por túnel — deuda ya anotada, mismo patrón que la rotación
  pendiente de `LDAP_BIND_PASSWORD`/`AUTH_JWT_SECRET` en `gti-app`.
- **[Riesgo] Escritura masiva (~34 mil upserts) contra datos reales de MEF** → **Mitigación:**
  D2 (dry-run obligatorio primero) + confirmación explícita del usuario en el momento antes de
  `SIGA_DRY_RUN=0` (ver tasks.md) — el concilio aprueba el DISEÑO, no autoriza la escritura real
  por sí solo.

## Migration Plan

1. Confirmar con el usuario el momento de recrear `db` (interrupción breve).
2. Editar `docker-compose.server.yml` (agregar `ports: ["127.0.0.1:5436:5432"]` al servicio
   `db`), commitear, sincronizar al servidor (patrón `git archive` de MB1).
3. En el servidor: `docker compose -f docker-compose.server.yml up -d --force-recreate db` (con
   `-f` explícito siempre). Verificar `healthy`.
4. Verificar que `comptrol-api` se recuperó: `GET http://localhost:3001/api/v1/health/ready` →
   `200` (no asumir que Prisma reconectó solo).
5. Túnel SSH local → `127.0.0.1:5436` del servidor.
6. Dry-run contra el túnel, comparar resumen contra `docs/IMPORTACION_SIGA.md`.
7. Mostrar el resumen al usuario y pedir confirmación explícita para la corrida real.
8. Corrida real (`SIGA_DRY_RUN=0`) contra el túnel.
9. Verificar en la app real (dashboard "Activos") que los números cuadran.
10. Cerrar el túnel SSH (el puerto en el servidor queda publicado en loopback, no se revierte —
    ver D1).

**Rollback:** el import es `upsert` por `assetTag`, no borra nada — si algo sale mal a mitad de
corrida, se puede volver a correr sin duplicar (es idempotente por diseño, ver
`docs/IMPORTACION_SIGA.md`). Si hiciera falta deshacer por completo, **corregido tras concilio**
(borrar solo los assets deja huérfanos los usuarios y ubicaciones que el import creó) — el
procedimiento completo, en este orden, es:

1. `DELETE FROM assets WHERE fingerprint LIKE 'siga:%'` (todos los activos importados llevan ese
   prefijo).
2. Borrar `OrgUnit`/`Location` que el import haya creado y que hayan quedado sin ningún activo
   (`_count.assets = 0`, mismo criterio que usa el propio script para su limpieza interna de
   duplicados) — no borrar las que ya existían antes del import y quedaron reutilizadas.
3. `DELETE FROM users WHERE sso_provider = 'siga'` (los 3,245 responsables creados como usuarios
   inactivos, `email` con dominio `@siga.local`) — se puede borrar después de 1 sin violar FK,
   porque `Asset.ownerUserId` tiene `onDelete: SetNull`.

No se automatiza como script en este cambio (es un procedimiento de emergencia, no parte del
flujo normal) — queda documentado acá para no tener que reconstruirlo bajo presión si hiciera
falta.
