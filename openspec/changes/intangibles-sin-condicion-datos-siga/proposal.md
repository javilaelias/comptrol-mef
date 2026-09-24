## Why

El Excel del coordinador (corte 30/06/2026) tiene **932 bienes vigentes sin condición** (ej.
`140400030005`, "(03) RED HAT ENTERPRISE LINUX SERVER, PREMIUM"). El usuario pide (2026-09-24) una
pestaña nueva con lo que SIGA sabe de esos bienes: la fecha de vencimiento y la orden de compra o
servicio, para completarlos sin buscarlos uno por uno.

Verificado contra `siga15072026` (sec_ejec 46) sobre los 932:
- `sig_patrimonio.fec_fin_vida` (fin de vida útil contable = alta + `vida_util` años) existe en
  916. `fecha_garantia_fin` está vacía en los 932 → no sirve. Es la única "fecha de vencimiento"
  que SIGA tiene; se rotula como **fin de vida útil (SIGA)**, no como vencimiento de licencia.
- Tipo de ingreso (`tipo_doc_refer` → `maestro_documento`): 583 por **031 Orden de compra - Guía de
  Internamiento**, 349 por **045 Nota de Entrada de Almacén** (sin orden, `nro_orden` = 0).
- De los 583 con N° de orden, **548** se ubican en `sig_orden_adquisicion` + `sig_orden_item` con
  el mismo ítem de catálogo (grupo/clase/familia/ítem) y año de compra o el anterior → orden
  verificada (todas tipo `B` = Orden de Compra). En **35** el número no corresponde: p. ej. el
  `140400030005` dice OC 553 con alta 26/12/2013, pero la OC 553-2013 es "ADQUISICION DE MATERIAL
  DE CABLEADO TELEFONICO". El cruce solo por número daría datos falsos → se muestra el N° de SIGA
  marcado **"no verificada"**, sin inventar objeto ni fecha.

## What Changes

- 6 columnas nuevas, opcionales, en `intangible_records` (solo las llena la versión SIGA):
  `end_of_life_at`, `entry_doc`, `po_kind` (`OC`/`OS`), `po_date`, `po_subject`, `po_verified`.
  `po_year` no cambia de significado (sigue siendo el año de alta, concilio H6) para no alterar
  "Cantidades por OC".
- `import:siga-intangibles` lee `fec_fin_vida`, el tipo de ingreso y la orden verificada por ítem.
- Vista nueva de comparación `no-condition-siga` (API + exportación a Excel), reutilizando el
  patrón de las 6 vistas existentes.
- **Pestaña nueva** "Sin condición: datos SIGA" en Intangibles, con filtro por situación de la orden
  (verificada / no verificada / ingreso por NEA), búsqueda, paginación y exportar.
- Despliegue a staging: migración + recarga del corte SIGA 15/07/2026 con `SIGA_REPLACE=1` por el
  túnel SSH ya usado.

## Impact

- `apps/api/prisma/schema.prisma` + migración aditiva (columnas nulas, sin backfill).
- `apps/importer/scripts/import-siga-intangibles.ts`.
- `apps/api/src/modules/intangibles/reconciliation.service.ts`.
- `apps/web/src/app/intangibles/` (page + tab nuevo).
- Fuera de alcance: escribir la condición en el Excel o deducirla de SIGA; órdenes de servicio
  (ninguno de los 932 entra por OS, pero `po_kind` lo admite si aparece).
