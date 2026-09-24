# Concilio — intangibles-sin-condicion-datos-siga (2026-09-24)

Profundidad: **5 revisores** (agrega columnas a `intangible_records`, tabla compartida por el
listado, licencias y alertas). Verificado contra el código real y contra `siga15072026`.

## Arquitectura
- **Software — APROBADO.** El controlador ya es genérico (`reconciliation/:view` y
  `reconciliation/:view/export` validan con `assertView`): basta sumar la vista a
  `RECONCILIATION_VIEWS` y a `EXPORT_COLUMNS`. `currentRecordsCte` usa `SELECT r.*`, así que las
  columnas nuevas llegan solas a `s`. Nadie tiene FK a `intangible_records` (solo cascada desde
  `intangible_batches`): el reemplazo del corte SIGA no rompe licencias ni alertas.
- **Solución — APROBADO.** Staging no alcanza la base SIGA (vive en esta PC), así que el dato
  tiene que persistirse al importar; el camino (importador local + túnel 5437) ya está probado.
  Migración aditiva de columnas nulas, sin backfill: reversible con `DROP COLUMN`.

## Reutilización — APROBADO
Reusar `paged`, `currentRecordsCte`, `safeCell`, `Pager`, `inputClass`, `buttonClass`,
`apiDownload`, `formatDate`. Sin endpoint nuevo.

## Producto/UX — APROBADO CON CAMBIOS
- C1. La exportación debe incluir la **fila del Excel** y la descripción, para que el coordinador
  ubique el bien.
- C2. Rotular "Fin de vida útil (SIGA)" y explicar en la ayuda que es la fecha contable
  (alta + vida útil), no el vencimiento de la licencia.
- C3. Conteos por situación en el filtro (verificada / no verificada / NEA).

## Riesgo/QA — APROBADO CON CAMBIOS
- Mayor riesgo: **mostrar una orden equivocada** (el cruce solo por número falla, caso
  `140400030005` → OC 553-2013 de cableado). Mitigación: solo se llenan fecha/objeto/tipo cuando
  el ítem de catálogo coincide; si no, "No verificada".
- C4. Antes de recargar SIGA en staging: `pg_dump` de `intangible_batches`/`intangible_records`/
  licencias; comparar después cantidad de licencias y alertas (no deben cambiar).
- C5. Verificar los números esperados en local antes de staging (916 / 548 / 35 / 349).

## Simplicidad — APROBADO
Se evaluó guardar los datos en `raw` (JSONB) para evitar la migración; se prefieren columnas
tipadas porque la migración es trivial y el patrón de despliegue ya la contempla.

## Veredicto: **APROBADO CON CAMBIOS** (C1–C5 aplicados a `tasks.md`)
Sin ADR (patrón existente, cambio aditivo). Estándar i18n/tema: el módulo Intangibles es solo ES
hoy; la pestaña sigue el patrón del módulo (sin barrido retroactivo).

---

## Ajuste 2026-09-24 (pedido del usuario tras verlo en staging) — 2 revisores

Pedido: la columna "Situación" pasa a clasificar la licencia según el fin de vida útil de SIGA:
vencido → **No perpetuo**, sin fecha → **Perpetua**, fecha futura → **Vigente** (decisión del
usuario para los 346 casos que el pedido no cubría). La verificación de la orden pasa a una
columna aparte, "Orden", con su propio filtro (decisión del usuario).

- **Reutilización — APROBADO.** Mismo patrón que `expiryBucketSql`: `CASE` en SQL, sin columna
  nueva ni migración (depende de la fecha de hoy, no se persiste).
- **Riesgo/QA — APROBADO.** Solo lectura, sin cambio de esquema. Los dos filtros viajan en
  `subset` como lista separada por comas (el controlador no cambia). Verificar: 570 / 346 / 16.
- Arquitectura software/solución: sin impacto (misma vista y endpoint).

**Veredicto: APROBADO.**

---

## Ampliación 2026-09-24: ver la orden al hacer clic — 5 revisores (agrega columna)

- **Arquitectura de software — APROBADO.** `po_detail` JSONB en `intangible_records`: la orden es
  una copia fija por corte, de solo lectura; se reemplaza junto con la versión SIGA (cascada).
  Duplicar la orden en cada bien de la misma OC es aceptable (tamaño medido al cargar).
  `IntangiblesService.detail` hace `const { raw, ...rest } = r` → `poDetail` sale solo.
- **Arquitectura de solución — APROBADO.** Mismo importador y túnel; una consulta extra por lote
  de órdenes (`unnest` de claves), sin N+1. Migración aditiva.
- **Reutilización — APROBADO.** Endpoint de detalle existente; patrón de fila expandible de
  `ListTab`.
- **Producto/UX — APROBADO CON CAMBIOS.** C6: rotular "Orden reconstruida desde SIGA (no es el
  documento firmado)". C7: montos con `formatMoney` y moneda de la orden.
- **Riesgo/QA — APROBADO CON CAMBIOS.** C8: no mostrar el `estado` numérico de la orden (códigos
  0/1/2/4 sin tabla que los explique). C9: verificar que la OC 1-2014 (140400030144) muestra
  S/ 84,096.44 y que el 140400030005 muestra el aviso de no verificada. Mismo respaldo previo en
  staging que la entrega anterior.
- **Simplicidad — APROBADO.** Se descartó tabla `siga_purchase_orders` + FK: más piezas para un
  dato de solo lectura.

**Veredicto: APROBADO CON CAMBIOS** (C6–C9 en `tasks.md`).
