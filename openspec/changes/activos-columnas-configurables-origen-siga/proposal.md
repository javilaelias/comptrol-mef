## Why

Con los 34,169 activos de SIGA ya cargados en staging, la lista de "Activos" solo muestra 6
columnas fijas de los ~30 campos reales que trae cada activo (marca, modelo, serie, valores,
fechas de garantía/compra, responsable, etc. quedan invisibles sin forma de verlos). Además no
hay ninguna señal en la UI de que un activo viene de la importación de SIGA vs. de alta manual —
pedido directo del usuario tras ver los datos cargados.

## What Changes

- Agregar un indicador visual de origen ("Importado de SIGA") en la lista y en el detalle de cada
  activo, derivado del campo `fingerprint` que el importador ya escribe (prefijo `siga:`) — sin
  agregar ningún campo nuevo al esquema.
- Reemplazar la tabla HTML fija por una tabla con **columnas configurables**: un selector lista
  todas las columnas disponibles (las ~30 del modelo `Asset`, agrupadas), el usuario elige cuáles
  ver: las visibles se muestran en la tabla, y si no entran en el ancho de pantalla se accede a
  ellas con **scroll horizontal** (no con paginación de columnas ni colapsando filas).
- Backend: agregar `owner` (responsable) al `include` de `GET /assets` — hoy falta en el listado
  (solo está en el detalle de un activo), y es una columna que el usuario va a querer ver.
- Preferencia de columnas visibles persistida en `localStorage` (conveniencia por navegador, no
  necesita ir al servidor).

## Capabilities

### New Capabilities
- `asset-list-configurable-columns`: selección de columnas visibles en la lista de activos, con
  scroll horizontal para las que excedan el ancho visible, e indicador de origen SIGA.

### Modified Capabilities
(ninguna — no hay spec previa de listado de activos en este repo)

## Impact

- **Afecta:** `apps/web/src/app/assets/page.tsx` (reescritura de la tabla), `apps/web/src/app/
  assets/[id]/page.tsx` (agregar indicador de origen), `apps/api/src/modules/assets/
  assets.service.ts` (agregar `owner` al `include` del listado). Nueva dependencia de frontend:
  `@tanstack/react-table` (MIT, headless, primera vez en este repo).
- **No afecta:** el importador de SIGA (`import-siga.ts`, ya cerrado en el bloque anterior), el
  esquema de Prisma (no hay migración), el flujo SSO/`gti-app`.
- **Riesgo:** bajo — cambio de solo lectura en la UI, aditivo en el backend (no quita ningún
  campo que ya se devolviera), sin escritura a datos reales, fácil de revertir.
