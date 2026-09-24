## 1. Esquema
- [x] 1.1 Columnas nuevas en `IntangibleRecord` (`end_of_life_at`, `entry_doc`, `po_kind`, `po_date`, `po_subject`, `po_verified`) + migración aditiva `20260924100000_intangibles_siga_order`

## 2. Importador SIGA
- [x] 2.1 `import-siga-intangibles.ts`: `fec_fin_vida`, `maestro_documento.nombre` del `tipo_doc_refer`, orden verificada por ítem de catálogo (año de compra o anterior; `B`→OC, `S`→OS; la más cercana a la fecha de compra). Sin ítem coincidente → solo N°, `po_verified=false`
- [x] 2.2 (C5) Correr en local con `SIGA_REPLACE=1` y verificar: 10,120 registros; en los 932 → 916 con fin de vida, 548 verificadas, 35 no verificadas, 349 NEA

## 3. API
- [x] 3.1 Vista `no-condition-siga` (subset `verified` | `unverified` | `no_order`) + columnas de exportación con fila del Excel y descripción (C1)
- [x] 3.2 (C3) Conteos por situación en `summary`

## 4. Web
- [x] 4.1 Pestaña "Sin condición: datos SIGA" (tabla, filtro con conteos, búsqueda, paginación, exportar); rótulo "Fin de vida útil (SIGA)" con ayuda (C2)

## 5. QA y despliegue
- [x] 5.1 Lint + tests + build; smoke local de la pestaña
- [x] 5.2 (C4) Staging: `pg_dump` de tablas `intangible_*` y licencias, deploy, `prisma migrate deploy`, recarga SIGA por túnel, verificación de conteos y de que licencias/alertas no cambian

## 6. Ajuste: Situación Perpetua / No perpetuo / Vigente
- [x] 6.1 API: `life_status` (CASE sobre `end_of_life_at`), `subset` como lista separada por comas, conteos en `summary`, columna en la exportación
- [x] 6.2 Web: columna "Situación" nueva + "Orden" aparte, dos filtros
- [x] 6.3 Verificar 570 / 346 / 16 en local y desplegar a staging (solo código, sin migración ni recarga)
