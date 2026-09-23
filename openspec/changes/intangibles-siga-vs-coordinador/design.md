## Context

- Stack: API NestJS 11 + Prisma 7 (`apps/api`), web Next.js (`apps/web`), scripts de carga en
  `apps/importer/scripts` (ts-node). Producción: `docker-compose.server.yml`, que ya ejecuta
  `prisma migrate deploy` al arrancar la API.
- La base de SIGA (`siga15072026`) es una base PostgreSQL aparte, de solo lectura, a la que llega
  solo el importer mediante `SIGA_DATABASE_URL` (en staging, por túnel SSH al puerto 5437). La API
  **no** se conecta a SIGA.
- En `sig_patrimonio` los intangibles son `sec_ejec=46, grupo_bien='14', clase_bien='04'` (10,120
  bienes; `estado='2'` es baja). `nro_orden` es numérico, `proveedor` es un código que se resuelve
  con `sig_contratistas.proveedor → nombre_prov, nro_ruc`, y el código patrimonial es
  `codigo_activo`.
- El Excel del coordinador (hoja `margesi al 14`) tiene la fila 1 con basura de encabezado, la
  fila 2 con los encabezados y 25 columnas. Las columnas propias del coordinador son CONDICION,
  FECHA DE VENCIMIENTO, Justificación, HR y DOCUMENTO; las cuentas contables también vienen del
  Excel.
- Autorización: el acceso a Comptrol ya está restringido por `ROLE_COMPTROL` en el portal
  `gti-app`. Dentro de Comptrol los usuarios SSO entran como `employee`; los roles
  `super_admin`/`it_admin` existen y se validan con `RolesGuard` + `@Roles`.
- `software_licenses` ya existe, la usan `seed.ts`, `import-docs.ts` (no idempotente) y
  `dashboard.service.ts`. No hay pantalla web de licencias.
- No existe hoy ningún scheduler ni subida de archivos en la API.

## Goals / Non-Goals

**Goals:**
- Tener un módulo de intangibles versionado por fuente y por corte, que permita comparar
  cualquier par de versiones vigentes.
- Subir el Excel desde la web de forma segura (validación de tipo y tamaño, sin ejecutar nada del
  archivo).
- Hacer el cruce y las seis vistas en SQL, sobre ~10k filas por versión, con respuesta rápida.
- Alimentar `software_licenses` de forma idempotente, sin tocar las licencias de otro origen.
- Tener alertas diarias con bandeja en la app.

**Non-Goals:**
- Subir el dump de SIGA desde la web: pesa 5.9 GB y seguirá cargándose por script.
- Editar los datos del coordinador dentro de Comptrol: la fuente sigue siendo su Excel.
- Migrar otras funciones de Vencix (requerimientos OIT, trámite, contratos y OS).
- Correo, Telegram, SMS o notificaciones push: solo la bandeja en la app (decisión del usuario,
  2026-09-23; el correo puede agregarse después sin cambiar el modelo).
- Mezclar intangibles en `assets` o en el Dashboard de equipos.

## Decisions

### D1. Modelo de datos: versiones + registros planos
- `intangible_batches`: `id, tenant_id, source ('siga'|'coordinator'), cut_date, file_name,
  uploaded_by, row_count, warnings jsonb, is_current bool, created_at`. Un solo `is_current=true`
  por `(tenant_id, source)` (índice único parcial). Un corte por fecha solo para SIGA (índice único
  parcial `WHERE source='siga'`): el coordinador puede subir varias versiones del mismo corte
  ("version 1", "version 2"). `warnings` guarda el reporte de la carga: `{ headers, discarded,
  items }`, donde `headers` es el orden original de columnas que se usa al exportar los pendientes.
- `intangible_records`: `id, batch_id (FK cascade), patrimonial_code, inventory_code,
  description, brand, model, status ('active'|'retired'), po_number int null, po_year int null,
  supplier_name, supplier_ruc, contract_number, registered_at date, initial_value numeric(14,2),
  org_unit, physical_location, account_code, account_name, condition_norm, condition_raw,
  expires_at date, justification, hr, document, raw jsonb`. Índices `(batch_id,
  patrimonial_code)` único, `(batch_id, po_number, po_year)` y `(batch_id, expires_at)`.
- Las columnas que solo aplican a una fuente quedan en NULL en la otra.
- **Alternativa descartada:** una tabla "maestra" de intangibles actualizada en sitio. Se pierde
  el historial y "qué cambió entre versiones", que el usuario pidió (SIGA y el Excel van a traer
  versiones nuevas).
- Volumen: unas 10k filas por versión, unas 20k por par. Guardar varias versiones es trivial en
  Postgres.

### D2. Carga de SIGA: script aparte en el importer
`apps/importer/scripts/import-siga-intangibles.ts` (`npm run import:siga-intangibles`) con
`SIGA_CUT_DATE=YYYY-MM-DD` obligatorio y `SIGA_REPLACE=1` opcional para reemplazar un corte
existente. Reutiliza el patrón de conexión de `import-siga.ts` (sin tocarlo). Inserta en una
transacción: crea el batch, inserta los registros por lotes (`createMany` de 1,000), marca el
batch como vigente y luego llama a la regeneración de licencias (D6). `nro_orden = 0` se guarda
como `NULL`. `po_year` = año de `fecha_alta` (verificado por el concilio, H6: `ano_eje` es el año
de proceso del corte, 2026 en todos los bienes, y no sirve como año de la OC). El Excel usa la
misma regla con su FECHA DE ALTA. **Alternativa descartada:**
agregar un flag a `import-siga.ts`, que escribe en `assets` con otra lógica y ya está cerrado y
probado en staging.

### D3. Subida del Excel: multipart en la API, parseo con `exceljs`
- `POST /intangibles/batches/coordinator` (multipart, campo `file` + `cutDate`), con
  `FileInterceptor` de `@nestjs/platform-express` (ya instalado; se agrega `@types/multer` en
  devDependencies), `memoryStorage`, límite 20 MB, aceptando solo la extensión `.xlsx` y la firma
  ZIP (`PK\x03\x04`). `cutDate` llega por `UploadCoordinatorDto { @IsDateString() cutDate }`,
  porque el `ValidationPipe` global usa `forbidNonWhitelisted`.
- Topes de seguridad: 250 MB descomprimidos, 20 hojas y 50,000 filas por hoja (zip bomb). El nombre del archivo se guarda saneado (`basename`, máximo 200 caracteres).
- Parseo con `exceljs` (`workbook.xlsx.load`), en modo solo valores (no evalúa fórmulas). Se
  descartó el lector en streaming porque falla cuando el zip trae las hojas antes que
  `workbook.xml` (depende del programa que generó el archivo). Antes de cargar se suma el tamaño
  descomprimido que declara el directorio central del zip y se rechaza si supera 250 MB.
  Se detecta la hoja por los encabezados: la primera hoja cuya fila de encabezados contenga COD
  PATRIMONIAL + DESCRIPCION DEL BIEN + CONDICION + FECHA DE VENCIMIENTO. Encabezados
  normalizados (trim, mayúsculas, sin tildes), así que "PROVEEDOR " y "Justificación" calzan.
- Validación por fila: código vacío (se descarta), código repetido (gana la primera; advertencia)
  y fecha ilegible (se guarda NULL; advertencia). Las advertencias se guardan en `warnings` y se
  devuelven en la respuesta.
- **Por qué `exceljs` y no `xlsx`@0.18.5** (el que usa el importer): la versión de npm de SheetJS
  tiene CVE-2023-30533 (prototype pollution) y CVE-2024-22363 (ReDoS), y aquí el archivo llega
  del usuario. `exceljs` también sirve para exportar (D5), así que es una sola dependencia para
  las dos cosas.
- Autorización: cualquier usuario autenticado de Comptrol puede subir (decisión del usuario: "con
  el role comptrol"). Cada subida queda en `audit_logs` con usuario, archivo y cantidad de filas.

### D4. Comparación en SQL sobre dos batches
`IntangiblesReconciliationService` recibe `sigaBatchId` y `coordBatchId` (por defecto, los
vigentes) y ejecuta `$queryRaw` con `FULL OUTER JOIN` por `patrimonial_code`:
- solo-SIGA (separado en *vigentes* y *bajas*), solo-Excel y campos distintos. Normalización en SQL: `upper(regexp_replace(btrim()))`
  para textos (sin `unaccent`: SIGA y el Excel traen las mismas tildes, y la condición se
  normaliza al cargar), `0 ≡ NULL` para OC (se guarda NULL al cargar) y `abs(a-b) > 0.01` para
  valores.
- cantidades por OC: `GROUP BY po_number, po_year` en cada lado + `FULL JOIN`.
- pendientes y vencimientos: sobre el batch del coordinador, filtrando por bienes vigentes en
  SIGA.
- marca de cuenta sospechosa: `upper(account_name) LIKE 'MUEBLES Y ENSERES NO DEPRECIABLE%'`.
- aviso de cortes: `coord.cut_date > siga.cut_date`.

El proveedor **no** entra en "campos distintos" (concilio H5: 6,555 de 8,688 difieren solo por
la razón social, como "S.A.C." contra "SOCIEDAD ANONIMA CERRADA"). Se muestra lado a lado en el
detalle, como dato informativo. La UI compara siempre la versión vigente contra la vigente; el
servicio acepta IDs, pero no se expone un selector.

Resumen de conteos en `GET /intangibles/reconciliation/summary`; cada vista en
`GET /intangibles/reconciliation/:view?filters&take&skip`. Endpoint de solo lectura.

### D5. Exportación
`GET /intangibles/reconciliation/:view/export` devuelve `.xlsx` generado con `exceljs` en
streaming (hasta ~10k filas), con una hoja "Datos" y una cabecera con los cortes de SIGA y del
Excel y la fecha de generación. La exportación de "Pendientes" repite las 25 columnas originales
del Excel + "Motivo" para que el coordinador la complete y la devuelva. Todas las celdas se
escriben como texto o valor, nunca como fórmula. Los textos que empiezan con `= + - @` se prefijan
con `'` para evitar la inyección de fórmulas al abrir el archivo.

### D6. Licencias desde intangibles
- Migración: agregar `perpetual` al enum `LicenseType` y `retired` al enum `LicenseStatus` (no
  existen hoy); agregar a `software_licenses` las columnas `origin varchar(30) default 'manual'` y
  `origin_key varchar(300) null`, con índice único parcial `(tenant_id, origin, origin_key) WHERE
  origin_key IS NOT NULL`. `import:docs` se ajustó para borrar solo licencias `origin='manual'`.
- `LicensesFromIntangiblesService.regenerate(tenantId)`: toma el batch SIGA vigente + el
  coordinador vigente, agrupa por `origin_key = upper(unaccent(collapse_spaces(description)))` y
  hace upsert con `origin='intangibles'`: `softwareName`, `vendor` (moda de la marca),
  `totalSeats` (bienes vigentes), `renewalDate` (mínimo `expires_at >= hoy`, o NULL) y `status`.
  Los grupos sin bienes vigentes pasan a `status = retired`. Nunca toca `origin <> 'intangibles'`.
- `licenseType`: `perpetual` si la condición mayoritaria del grupo es "VIDA ÚTIL INDEFINIDA"; si
  no, `subscription`.
- **Dashboard (concilio H4):** el KPI "Licencias registradas (total)" suma `totalSeats` de todas
  las licencias. Pasa a excluir `status='retired'` y devuelve además `intangibleSeats` para que la
  tarjeta muestre el desglose "de ellas, N desde intangibles". Los asientos de intangibles
  vigentes sí cuentan, porque son licencias reales del MEF.
- Se ejecuta al final de la carga de SIGA, al subir el Excel, al cambiar la versión vigente y
  con `POST /licenses/regenerate` (admins).
- La relación licencia→bienes no se persiste: se consulta por `origin_key` sobre el batch vigente.
- La lógica vive en una función suelta (`licenses/licenses-from-intangibles.ts`) que usan la API
  y el script de SIGA. El script importa el cliente de Prisma de `apps/api/node_modules` (misma
  convención que `import-docs.ts`), porque el cliente de la raíz del repo no se regenera con el
  esquema de la API.
- "SIN MARCA" de SIGA no se usa como fabricante (queda vacío).
- Si la regeneración falla al subir el Excel o cambiar la versión, la subida no se revierte: la
  respuesta trae `licenses.ok = false`, queda en el log y se reintenta con `POST /licenses/regenerate`.
- Web `/licenses`: lista y detalle (bienes del grupo).

### D7. Alertas
- Tablas `alert_rules` (una sola fila por tenant: `tenant_id` único, `days_before int[] default {90,60,30,7}, include_expired bool
  default true, enabled bool`) y `alerts` (`id, tenant_id, kind
  ('license_expiry'), target_type, target_id, threshold_days int (negativo = vencida),
  due_date, title, status ('open'|'acknowledged'|'dismissed'|'auto_resolved'), resolved_by,
  resolved_at, created_at`) con índice único
  `(tenant_id, kind, target_id, threshold_days, due_date)`: la deduplicación la hace la base de
  datos.
- Generación diaria con `@nestjs/schedule` (`@Cron('0 7 * * *', { timeZone: 'America/Lima' })`),
  también invocable con `POST /alerts/run` (admins). Recorre las licencias con `renewalDate` y
  crea la alerta del umbral más cercano cruzado (no una por cada umbral pasado). Las vencidas
  generan una sola alerta por licencia y fecha (`threshold_days = -1`). Luego hace auto-resolve
  de las alertas abiertas cuyo `due_date` ya no corresponde al de la licencia.
- Si una alerta que se cerró sola vuelve a corresponder (por ejemplo, se reactiva "alertar
  vencidas" o la fecha vuelve a la anterior), se **reabre**: el índice único impediría crearla de
  nuevo. Las atendidas o descartadas por una persona no se reabren.
- La generación es una función suelta (`alerts/expiry-alerts.ts`), igual que la de licencias.
  Corre en el cron diario, con `POST /alerts/run`, al guardar las reglas y después de cada
  regeneración de licencias (subida del Excel, cambio de versión, carga de SIGA), así la bandeja
  queda al día sin esperar a las 07:00.
- `GET /alerts/rules` devuelve `canEdit` según el rol, porque la web no guarda el rol del usuario.
- Con varias réplicas de la API el job correría varias veces, pero el índice único lo hace
  idempotente (`INSERT ... ON CONFLICT DO NOTHING`). Hoy hay una sola réplica.
- Endpoints de administración (`PUT /alerts/rules`, `POST /alerts/run`,
  `POST /licenses/regenerate`) con `@Roles('super_admin','it_admin')`.
- Web `/alerts`: bandeja con pestañas por estado, botones Atender/Descartar y configuración de
  reglas (solo admins). `TopNav` muestra el contador de abiertas desde `GET /alerts/count`.

### D8. Web
- Rutas nuevas: `/intangibles` (pestañas Listado, Comparación y Versiones, más el botón "Subir
  Excel"), `/licenses` y `/alerts`. Siguen el patrón de `assets/page.tsx` (`apiFetch`, tabla con
  paginación y columnas de `assets/columns.tsx`). No se agregan dependencias de tabla nuevas.
- Subida con `<input type=file accept=".xlsx">` + fecha de corte (sugerida desde el nombre del
  archivo "AL dd.mm"), mostrando el resultado (filas y advertencias).
- `TopNav`: agregar "Intangibles", "Licencias" y "Alertas (n)".

## Risks / Trade-offs

- **[Excel con formato cambiado por el coordinador]** → La detección por encabezados tolera el
  orden y las mayúsculas. Si falta una columna obligatoria, se rechaza con la lista de faltantes y
  no se carga nada a medias.
- **[Año de OC mal inferido]** → Si `sig_patrimonio` no tiene el año de la orden, se usa el año
  de `fecha_alta`, y una OC de diciembre dada de alta en enero caería en otro año. Se mitiga
  aplicando la misma regla en ambos lados (el Excel no tiene año de OC; se usa su FECHA DE ALTA),
  así que la comparación sigue siendo consistente.
- **[Primera generación de alertas masiva]** → Hay 2,602 bienes vencidos. Se agrupan por
  licencia (D7), así que son decenas de alertas y no miles.
- **[Subida de archivo malicioso]** → Se valida la extensión y la firma, hay límite de 20 MB, se
  lee solo valores (sin fórmulas ni macros; `.xlsm` rechazado), se procesa en memoria sin guardar
  en disco y el parser es mantenido y sin CVE abiertos.
- **[`software_licenses` también la llena `import:docs`, que no es idempotente]** → Las columnas
  `origin` y `origin_key` aíslan los dos mundos. `import:docs` no cambia; sus filas quedan
  `origin='manual'`.
- **[Todo usuario de Comptrol puede subir]** → Es lo que decidió el usuario. Queda registrado en
  auditoría y ninguna subida borra versiones anteriores, así que una subida equivocada se revierte
  marcando otra versión como vigente.
- **[Tamaño del cambio]** → Se implementa por fases (D1-D5 intangibles, D6 licencias, D7
  alertas). Cada fase es desplegable sola y las tareas están ordenadas así.

## Migration Plan

1. Migraciones Prisma aditivas, una por fase (fase 1: tablas de intangibles; fase 2: enums y
   columnas de licencias; fase 3: tablas de alertas). No tocan datos existentes.
2. **Forzar la instalación de dependencias (concilio H1, bloqueante).** La API monta
   `node_modules` en el volumen persistente `api_node_modules` y solo corre `npm ci` si falta
   `nest`, así que las dependencias nuevas (`exceljs`, `@nestjs/schedule`) no se
   instalarían y el build fallaría. Antes de reiniciar:
   `docker compose -f docker-compose.server.yml run --rm api npm ci --include=dev`, y luego
   `up -d api`. Verificar `docker compose logs api` y el healthcheck `/api/v1/health/ready`.
   Las dependencias nuevas quedan en `apps/api/package-lock.json` (el que usa el contenedor).
3. En staging: `SIGA_CUT_DATE=2026-07-15 npm run import:siga-intangibles` por el túnel existente.
4. Subir el Excel del 30/06/2026 desde la pantalla y verificar los conteos de la spec (9,986 /
   134 / 932 / 2,241 / 2,602 / 2,000).
5. Revisar los umbrales de alerta por defecto (90/60/30/7) con el usuario.

**Rollback:** revertir el commit y ejecutar una migración inversa que elimina las tablas nuevas y
las columnas `origin`/`origin_key`. No hay datos previos afectados; las licencias con
`origin='intangibles'` se borran antes de quitar la columna. Los valores nuevos de los enums
(`perpetual`, `retired`) no se pueden quitar fácilmente en Postgres: quedan sin uso, lo cual es
inofensivo.

## Open Questions

(ninguna: el correo quedó descartado por el usuario; las alertas son solo en la app)
