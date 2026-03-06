# Comptrol‑MEF (demo)

MVP ejecutable hoy para presentación:
- API (NestJS + Prisma + PostgreSQL)
- Web (Next.js + Tailwind) con login + dashboard + reportes
- Móvil (Expo) con login + escaneo QR + consulta por Asset Tag

## Requisitos
- Node.js (ya instalado)
- PostgreSQL 15 con BD `comptrol` (vacía)

## Base de datos
La API usa Prisma Migrate.

- Conexión: `apps/api/.env` (`DATABASE_URL`)
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

Importa equipos + licencias + aplicaciones:
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

## Ejecutar (desarrollo)
```bash
npm run dev
```

Puertos:
- Web: `http://localhost:3000`
- API: `http://localhost:3001/api/v1`

## Credenciales demo
- `admin@mef.gob.pe` / `Admin123!`

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
