## Why

El coordinador de infraestructura mantiene en Excel ("INTANGIBLES AL 30.06 (version 1)_22092023.xlsx",
hoja `margesi al 14`) la lista de bienes intangibles del MEF (licencias y software) y le agrega datos
que SIGA no tiene: condición de vida útil, fecha de vencimiento, justificación, HR y documento. Hoy
no hay forma de cruzar esa lista con SIGA, de ver qué le falta completar al coordinador ni de
recibir avisos de las licencias por vencer. Además, Comptrol excluye los intangibles de SIGA
(10,120 bienes) y el usuario deja de usar Vencix, así que las alertas de vencimiento tienen que
vivir en Comptrol.

Verificado contra `siga15072026` (corte 15/07/2026): los 9,986 códigos patrimoniales del Excel
existen en SIGA (grupo 14, clase 04, `sec_ejec` 46) con descripción, fecha de alta, valor inicial y
código de inventario idénticos. Las 639 diferencias de N° de OC son `0` en el Excel contra `NULL` en
SIGA, no diferencias reales. Los 134 intangibles de SIGA que no están en el Excel están todos dados
de baja.

## What Changes

- **Módulo "Intangibles" separado de "Activos"** (tabla propia, pantalla propia). No se mezcla con
  `assets`, para no distorsionar el Dashboard, el e-Waste ni los tipos de activo.
- **Carga de intangibles de SIGA** por script (`import:siga-intangibles`): los 10,120 bienes del
  grupo 14 clase 04, incluidas las bajas, con N° de OC, proveedor, N° de contrato, fecha de alta y
  valor inicial. Cada corrida queda como una **versión** con su fecha de corte.
- **Subida del Excel del coordinador desde la pantalla**, también versionada con su fecha de corte,
  el nombre del archivo y quién lo subió. Solo se lee la hoja `margesi al 14`. La hoja dinámica
  `Hoja1` se ignora porque su conteo se deriva de los datos.
- **Comparación SIGA vs coordinador**, por código patrimonial, con estas vistas:
  - *Solo en SIGA* / *Solo en Excel*.
  - *Campos distintos*: descripción, OC, fecha de alta, valor y código de inventario. `0` y vacío
    cuentan como iguales. El proveedor se muestra, pero no se compara: la razón social se escribe
    distinto en cada fuente.
  - *Cantidades por OC + año*.
  - *Pendientes del coordinador*: sin condición, o vida útil definida sin fecha de vencimiento.
  - *Vencimientos*: vencidos y por vencer.
  - Marca visible en las filas con cuenta contable "MUEBLES Y ENSERES NO DEPRECIABLE" (2,000
    filas): posible error de cuenta.
  - **Aviso** cuando el corte del Excel es más reciente que el de SIGA, porque entonces "solo en
    Excel" puede ser falso.
- **Regla de precedencia**: SIGA manda en los datos base; el Excel manda en condición, vencimiento,
  justificación, HR y documento. Nada se sobrescribe en silencio: toda discrepancia se muestra.
- **Exportar a Excel** cada vista de diferencias y de pendientes, para devolvérsela al coordinador.
- **Licencias alimentadas desde los intangibles**: se agrupan por descripción normalizada en
  `software_licenses` (asientos = bienes vigentes; renovación = próximo vencimiento). Las filas se
  marcan con su origen, así que las licencias cargadas por otros medios no se tocan. Se agrega la
  pantalla "Licencias", que hoy no existe en la web.
- **Módulo de Alertas** (reemplaza a Vencix para vencimientos): un job diario genera alertas de las
  licencias e intangibles que vencen dentro de umbrales configurables. Se muestran en una bandeja
  en la app, con contador en el menú. Sin correo (decisión del usuario, 2026-09-23).

## Capabilities

### New Capabilities
- `intangibles-inventory`: carga versionada de los intangibles de SIGA, y listado y detalle en el
  módulo "Intangibles".
- `intangibles-coordinator-upload`: subida versionada del Excel del coordinador desde la pantalla,
  con validación de formato.
- `intangibles-reconciliation`: comparación SIGA vs coordinador (seis vistas, marca de cuenta
  sospechosa, aviso de cortes, exportación a Excel).
- `licenses-from-intangibles`: agrupación de intangibles en licencias y pantalla "Licencias".
- `expiry-alerts`: reglas de umbral, generación diaria, bandeja en la app.

### Modified Capabilities
(ninguna: `asset-inventory-siga-import` y `asset-list-configurable-columns` no cambian; los
intangibles van a tablas propias)

## Impact

- **Esquema (migración Prisma nueva)**: tablas `intangible_batches`, `intangible_records`,
  `alert_rules` y `alerts`; columnas `origin` y `origin_key` en `software_licenses`; valores `perpetual` en `LicenseType` y
  `retired` en `LicenseStatus`. Es una
  migración aditiva que se aplica con el `prisma migrate deploy` que ya corre en el arranque de
  `docker-compose.server.yml`.
- **API (NestJS)**: módulos nuevos `intangibles` y `alerts`, y endpoints de lectura en `licenses`.
  Dependencias nuevas: `exceljs` (leer y exportar xlsx; se evita `xlsx`@0.18.5 por sus CVE
  conocidos), `@nestjs/schedule` (job diario).
- **Importer**: script nuevo `import-siga-intangibles.ts`. `import-siga.ts` no cambia.
- **Web (Next.js)**: páginas `/intangibles` (listado, subida, comparación), `/licenses` y `/alerts`;
  entradas en `TopNav`.
- **Dashboard**: el KPI "Licencias registradas (total)" pasa a excluir las licencias retiradas y
  muestra cuántos asientos vienen de intangibles (hoy suma todo sin filtro; concilio H4).
- **Despliegue**: hay que forzar `npm ci` en el contenedor de la API, porque `node_modules` vive
  en un volumen persistente (concilio H1).
- **No afecta**: `assets`, el SSO de `gti-app` ni la base de SIGA (solo lectura).
- **Fuera de alcance**: las otras funciones de Vencix (seguimiento de requerimientos OIT, trámite
  documentario, contratos y OS). Aquí solo se reemplazan las alertas de vencimiento; el resto se
  migrará en un cambio posterior (decisión del usuario).
