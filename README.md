# Comptrol‑MEF (demo)

MVP ejecutable hoy para presentación:
- API (NestJS + Prisma + PostgreSQL)
- Web (Next.js + Tailwind) con login + dashboard + reportes
- Móvil (Expo) con login + escaneo QR + consulta por Asset Tag

## Requisitos
- Docker Desktop (recomendado para desarrollo)
- Alternativa local: Node.js + PostgreSQL 15 con BD `comptrol` (vacía)

## Ejecutar (Docker recomendado)
Esto estandariza PostgreSQL/API/Web para desarrollo/QA y evita depender de Node instalado en tu PC.

Windows (1 comando):
```bat
comptrol.bat
comptrol.bat up
```

Manual (cualquier SO):
```bash
cp apps/api/.env.docker.example apps/api/.env.docker
docker compose up -d db
docker compose --profile app run --rm api sh -lc "test -d node_modules || npm ci; npx prisma generate; npx prisma migrate deploy; npm run db:seed"
docker compose --profile app up
```

Sugerencia: usa `comptrol.bat up -d` (detached) para no dejar el stack atado a la terminal.
Los logs se consultan aparte con `docker compose logs -f api`.

Linux remoto por SSH:
- Ver `docs/LINUX_DEPLOY.md`
- La web queda accesible desde otra maquina por `http://IP_DEL_SERVIDOR:3000`
- El navegador ya no necesita llamar directo al puerto `3001`; la web proxyea `/api/v1` internamente

## Base de datos
La API usa Prisma Migrate.

- Conexión (local): `apps/api/.env` (`DATABASE_URL`)
- Conexión (Docker): `apps/api/.env.docker` (`DATABASE_URL`)
- Puerto publicado en el host: **`5436`** (no 5432, que suele estar tomado por un PostgreSQL
  nativo u otro stack). Dentro de compose la API sigue hablando con `db:5432`.
  Para cambiarlo: `DB_HOST_PORT=5437 docker compose up -d db`.
- Cliente externo (DBeaver/pgAdmin): `localhost:5436`, usuario/password `postgres`, BD `comptrol`
- Migraciones: `apps/api/prisma/migrations/*`
- Semilla: `apps/api/prisma/seed.ts` (demo)

Comandos (desde la raíz):
```bash
npm run migrate
npm run seed
```

## Importar datos reales (/docs)
Archivos detectados:
- `docs/EQUIPOS TECNOLOGICOS.xlsx` (inventario de activos)
- `docs/Relacion de Licencias y aplicativos MEF - 31 dic 2025.xls` (licencias + aplicaciones)
- `docs/Encuesta ENAD 2025[R].pdf` (ENAD)

Importa equipos + licencias + aplicaciones (Excel) como job offline:

Docker (recomendado):
```bat
comptrol.bat job docs
comptrol.bat job docs reset
```

Manual (Docker):
```bash
docker compose --profile jobs run --rm import-docs
docker compose --profile jobs run --rm -e IMPORT_RESET=1 import-docs
```

Local (Node + PostgreSQL local):
```bash
npm run import:docs
```

Importa ENAD (PDF) a tablas operativas para dashboard (CPU, desktops/laptops/tablets, etc.):
```bash
npm run import:enad
```

Reimportar (limpia y vuelve a cargar):
```powershell
$env:IMPORT_RESET=1
npm run import:docs
npm run import:enad
```

En CMD (símbolo del sistema):
```bat
set IMPORT_RESET=1 && npm run import:docs
set IMPORT_RESET=1 && npm run import:enad
```

Nota: el PDF no expone qué checkbox está marcado como texto. Por eso las preguntas 10 (personal) y 11 (teletrabajo) se completan desde la web en `http://localhost:3000/enad`.

## Importar el patrimonio de SIGA

> Para los usuarios de la app: las tres decisiones de esta importación que cambian lo que se ve (solo equipos de TI, responsables como usuarios inactivos, periféricos con tipo `other`) están explicadas en [docs/IMPORTACION_SIGA.md](docs/IMPORTACION_SIGA.md).

Los dumps de SIGA llegan a `docs/siga_<ddmmaa>/` como export de Oracle 10g. Para dejarlos en PostgreSQL están los scripts numerados de `docs/siga_150726/migracion/`. Con la base ya cargada (por defecto `siga15072026`), este job vuelca el patrimonio al inventario:

```bash
npm run import:siga
```

La conexión se configura con `SIGA_DATABASE_URL` en `apps/api/.env`. El job empareja por código patrimonial: `sig_patrimonio.codigo_activo` es el `assetTag` de Comptrol, así que **los activos que ya existen se actualizan y los que faltan se crean**. Cada activo importado queda marcado con `fingerprint = siga:<sec_ejec>-<modalidad>-<secuencia>`.

Qué trae de SIGA:

| Comptrol | SIGA |
|---|---|
| `assetTag` / `inventoryCode` | `codigo_activo` / `codigo_barra` |
| `description`, `serialNumber`, `model` | `descripcion`, `nro_serie`, `modelo` |
| `vendor` | `marca.nombre` |
| `assetType` | se deduce de la descripción y del catálogo de bienes |
| `status` | `estado` = 2 (baja) → `retired`; `estado_actual` = S → `in_use`; resto → `in_stock` |
| `conditionLabel` | `mp_estado` (Bueno, Regular, Malo, Muy Malo, Nuevo, Chatarra, RAEE) |
| `purchaseDate`, `purchaseCost`, `warrantyEndDate` | `fecha_compra`, `valor_compra`, `fecha_garantia_fin` |
| `currentBookValue` | `valor_inicial` − `valor_deprec` |
| `orgUnit` | `sig_centro_costo.nombre_depend` |
| `location` / `site` | `sig_ubicac_fisica` / `tmp_sede` |
| `owner` | `sig_personal`, creado como usuario inactivo (`siga-<codigo>@siga.local`) |

Variables opcionales:

| Variable | Por defecto | Efecto |
|---|---|---|
| `SIGA_SOLO_TI` | `1` | Solo cómputo (grupo 74, clase 08) y telecomunicaciones (95/22). Con `0` importa todo el patrimonio. |
| `SIGA_INCLUIR_BAJAS` | `1` | Incluye los bienes dados de baja, con estado `retired`. |
| `SIGA_CREAR_USUARIOS` | `1` | Crea los responsables como usuarios inactivos para poder asignar el activo. |
| `SIGA_DRY_RUN` | `0` | Simula y muestra el resumen sin escribir nada. |
| `SIGA_LIMIT` | — | Limita las filas leídas (pruebas). |

Las series ilegibles de SIGA (`S/S`, `ILEGIBLE`, `INACCESIBLE`) y las repetidas se guardan como vacías, porque Comptrol exige serie única.

Dependencias y ubicaciones se reconocen por nombre sin importar tildes, mayúsculas ni espacios ("DIRECCION" de SIGA y "DIRECCIÓN" del Excel son la misma). Se reutiliza la más antigua y, al final, el job elimina las repetidas que quedaron sin equipos.

## Ejecutar (desarrollo)
```bash
npm run dev
```

Puertos:
- Web: `http://localhost:3000` (redirige a `/login`)
- API: `http://localhost:3001/api/v1` (health: `/api/v1/health/ready`)
- PostgreSQL (Docker): `localhost:5436`

## Credenciales demo
- `admin@mef.gob.pe` / `Admin123!` (super admin)
- `itadmin@mef.gob.pe` / `ItAdmin123!` (IT admin)
- `asset.manager@mef.gob.pe` / `Assets123!` (gestor de activos)

## Endpoints principales
- `POST /api/v1/auth/login`
- `GET /api/v1/dashboard/metrics`
- `GET /api/v1/enad/summary`
- `GET /api/v1/assets` (list)
- `POST /api/v1/assets` (create)
- `PATCH /api/v1/assets/:id` (update)
- `DELETE /api/v1/assets/:id` (retire)
- `POST /api/v1/assets/discovery`
- `GET /api/v1/assets/by-tag/:assetTag`
- `GET /api/v1/applications` (list)
- `GET /api/v1/licenses/holdings` (list)
- `GET /api/v1/catalog/sites|locations|org-units`
- `GET /api/v1/reports/operational/stale-assets?days=30&limit=100`
- `GET /api/v1/reports/tactical/ewaste-trend?months=12`
- `GET /api/v1/reports/gerencial/inventory-value-by-site`

## Dashboard
- ENAD: `http://localhost:3000/enad` (guía + configuración de 2 respuestas manuales)
- Mapa Perú: se muestra en el dashboard con distribución por sede (coordenadas iniciales deducidas por nombre; luego se puede afinar con lat/lon reales)
- Configurar coordenadas por sede: `http://localhost:3000/sites`

## Agente (.exe)
Ver `apps/agent-exe/README.md` para compilar el agente Windows que reporta “heartbeat” al API (`/api/v1/agent/heartbeat`).

## Problemas frecuentes

**`Bind for 0.0.0.0:5432 failed: port is already allocated`**
Otro PostgreSQL (servicio nativo de Windows u otro stack Docker) ocupa el 5432.
Por eso este proyecto publica la BD en `5436`. Si también estuviera ocupado,
levanta con otro puerto: `DB_HOST_PORT=5437 docker compose up -d db`.
Para ver quién lo tiene: `docker ps --format "{{.Names}} {{.Ports}}"`.

**`comptrol-api exited with code 137` / `Killed`**
Es el OOM killer: la VM de WSL2 se quedó sin memoria (no es un fallo de la app).
Ocurre en sesiones largas porque API y Web corren en modo watch con polling.
Revisa el techo con `docker info --format "{{.MemTotal}}"`; si es 4 GB o menos,
súbelo en `%USERPROFILE%\.wslconfig`:
```ini
[wsl2]
memory=8GB
```
Requiere `wsl --shutdown` (detiene TODOS los contenedores de la máquina, no solo los de este proyecto).
Confirmar la causa después de una caída: `docker inspect comptrol-api --format "{{.State.OOMKilled}}"`.
No hace falta re-ejecutar el setup: las migraciones y el seed persisten en el volumen
`comptrol_pgdata`; basta `docker compose --profile app up -d api web`.

**El lockfile de web aparece modificado sin haberlo tocado**
El contenedor `web` corre `npm install` si faltan dependencias, y al hacerlo en Linux
elimina los metadatos `libc` de `apps/web/package-lock.json`. Descarta ese cambio:
`git checkout -- apps/web/package-lock.json`.

## Operación (institucional)
- Lineamientos operativos: `docs/OPERATIONS.md`
- Runbook (N1/N2): `docs/RUNBOOK.md`
- Continuidad/Backups (DR): `docs/DR_BACKUP.md`

## XAMPP (Apache reverse proxy)
Ver `docs/xampp/apache-reverse-proxy.conf` para el snippet de configuración.
Si lo usas:
- Web: `http://localhost/comptrol/`
- API: `http://localhost/comptrol-api/api/v1`

Para que el Web apunte a la API por proxy, crea `apps/web/.env.local` con:
```bash
NEXT_PUBLIC_API_BASE_URL="http://localhost/comptrol-api/api/v1"
```

## Móvil (Expo)
```bash
npm run dev:mobile
```
En el login del app móvil puedes ajustar el `API Base URL` si corres en emulador o teléfono.
