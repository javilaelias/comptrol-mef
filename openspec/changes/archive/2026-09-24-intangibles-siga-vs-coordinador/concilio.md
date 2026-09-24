# Concilio — intangibles-siga-vs-coordinador

**Fecha:** 2026-09-23 · **Profundidad:** 5 revisores + lentes condicionales Seguridad y
Planificación (subida de archivos por usuarios, migración de esquema, job con correo, tabla
compartida `software_licenses`, varias fases).

Todo se verificó contra el código real (`apps/api`, `apps/web`, `docker-compose.server.yml`,
`schema.prisma`) y contra la base `siga15072026`, no solo contra el texto de la propuesta.

## Hallazgos verificados en el código y los datos

| # | Hallazgo | Evidencia |
|---|---|---|
| H1 | **El despliegue no instalaría las dependencias nuevas.** La API monta `node_modules` en el volumen persistente `api_node_modules` y solo corre `npm ci` si falta `node_modules/.bin/nest`. `exceljs`, `@nestjs/schedule` y `nodemailer` nunca se instalarían en el servidor, `npm run build` fallaría y la API no levantaría. | `docker-compose.server.yml` líneas 38-45 |
| H2 | **El enum `LicenseType` no tiene `perpetual`** (D6 lo usa). | `schema.prisma`: `per_user, per_device, concurrent, subscription, enterprise` |
| H3 | **El enum `LicenseStatus` no tiene `retired`** (la spec y D6 piden "retirada"). | `schema.prisma`: `active, expiring, expired, suspended` |
| H4 | **El Dashboard sí cambia.** El KPI "Licencias registradas (total)" suma `totalSeats` de **todas** las filas de `software_licenses`, sin filtro. Las licencias generadas desde intangibles le sumarían unos 9,986 asientos. La propuesta decía "No afecta Dashboard". | `dashboard.service.ts:28-30,48`; `ItamKpiDashboard.tsx:71-73` |
| H5 | **Comparar proveedor genera ruido masivo.** De 8,688 bienes con proveedor en ambos lados, **6,555 difieren** solo por la razón social ("ST COMPUTACION S.A.C." vs "ST COMPUTACION SOCIEDAD ANONIMA CERRADA"). Se llenaría "Campos distintos" de falsos positivos. | Consulta sobre `sig_patrimonio` ⨝ `sig_contratistas` vs Excel |
| H6 | **`ano_eje` no es el año de la OC.** Vale 2026 en todos los bienes (año de proceso del corte) y difiere del año de alta en el 100% de los casos. La regla de `po_year` es entonces el año de `fecha_alta` en ambos lados. Esto resuelve la tarea 2.1 desde ya. | `ano_eje` vs `extract(year from fecha_alta)`: 0 iguales / 9,409 distintos |
| H7 | **Falta `@types/multer`** para tipar `Express.Multer.File` con `FileInterceptor`. | `node_modules/@types` |
| H8 | `ValidationPipe` global tiene `forbidNonWhitelisted: true`: el campo `cutDate` del multipart necesita un DTO con `class-validator`, o la subida responde 400. | `main.ts` |
| H9 | Los 134 de "Solo en SIGA" son todos bajas. Mezclados con los vigentes esconderían la señal útil (un vigente de SIGA que el coordinador no tiene). | Cruce por código |
| H10 | El `package-lock.json` raíz ya está modificado sin commitear en el árbol de trabajo. Las dependencias nuevas deben quedar en `apps/api/package-lock.json`, que es el que usa `npm ci` en el contenedor. | `git status`; `apps/api/package-lock.json` existe |

## Veredictos por lente

### Arquitecto — Arquitectura de software: **APROBADO CON CAMBIOS**
El modelo de versiones por fuente y corte (D1) es correcto para el pedido de "nueva versión de
SIGA y nueva versión del Excel", y el cruce en SQL sobre dos batches (D4) es simple y rápido para
unas 10k filas. `origin`/`origin_key` aísla bien los intangibles de `import:docs`. Cambios: H2 y
H3 (enums), H6 (regla de `po_year`) y H8 (DTO de subida).

### Arquitecto — Arquitectura de solución: **APROBADO CON CAMBIOS**
El stack encaja (NestJS + Prisma + Postgres 15; `unaccent` es una extensión *trusted* desde PG13 y
viene en la imagen oficial `postgres:15`). El cron dentro de la API es aceptable con una sola
réplica, y la deduplicación por índice único lo hace seguro si algún día hay más. **Bloqueante
H1**: sin forzar la instalación de dependencias, el despliegue rompe producción.

### Reutilización: **APROBADO**
Se reutilizan la conexión y el patrón de `import-siga.ts` (sin modificarlo), `RolesGuard`/`@Roles`,
`AuditLog`, `apiFetch`, el patrón de tabla de `assets/page.tsx` y `FileInterceptor`, que ya viene
en `@nestjs/platform-express`. Es correcto no usar `xlsx`@0.18.5 para archivos subidos por
usuarios. No hay en el registro un módulo de alertas reutilizable: Vencix es Express + SQLite con
cron propio, así que no conviene portarlo; su diseño de "resumen diario por canal" sí se toma como
referencia.

### Producto/UX: **APROBADO CON CAMBIOS**
Resuelve lo pedido (opción A, subida por pantalla, comparación completa, licencias, alertas). Cambios:
- H5: proveedor **fuera** de "Campos distintos". Se muestra lado a lado en el detalle, como dato
  informativo.
- H9: "Solo en SIGA" se separa en *vigentes* (la señal) y *bajas* (informativo).
- H4: el KPI del Dashboard debe decidirse explícitamente, no ser un efecto colateral. Decisión:
  el KPI suma solo las licencias no retiradas (los asientos de intangibles vigentes cuentan, porque
  son licencias reales del MEF), y la tarjeta muestra el desglose "de ellas, N desde
  intangibles".

### Riesgo/QA: **APROBADO CON CAMBIOS**
- H1 es el mayor riesgo; ver la mitigación abajo.
- Las pruebas de subida y de licencias deben correr sobre la base local o una copia, **nunca**
  contra staging. La memoria del proyecto ya registra que `import:docs` no es idempotente y que se
  prueba solo en copia.
- Falta un test de regresión del KPI del Dashboard (H4) y del conteo de `assets` antes y después.
- El plan de reversa es válido. Hay que agregar que `ALTER TYPE ... ADD VALUE` no se revierte
  fácilmente en Postgres: el rollback deja los valores nuevos del enum sin uso, lo cual es
  inofensivo, y se documenta.

### Simplicidad: **APROBADO CON CAMBIOS**
El alcance es grande pero cada pieza fue pedida explícitamente. Para no sobre-diseñar:
- Sin selector de "comparar dos versiones cualesquiera" en la web: siempre se compara vigente vs
  vigente. El servicio acepta IDs, pero la UI no lo expone.
- La configuración de alertas es una sola fila por tenant (no reglas múltiples).
- Implementar y desplegar por fases (1-4 intangibles, 5 licencias, 6 alertas), cada una verificable
  sola.

### Seguridad (lente condicional): **APROBADO CON CAMBIOS**
Superficie nueva: la subida de archivos por cualquier usuario autenticado de Comptrol. Controles
exigidos, además de los de D3:
- Tope de **50,000 filas** y de **20 hojas** durante el parseo en streaming, que se aborta al
  superarlos (mitiga zip bombs: 20 MB comprimidos pueden expandirse a cientos de MB).
- Nombre de archivo saneado antes de guardarlo o mostrarlo (solo `basename`, 200 caracteres).
- En la exportación, las celdas se escriben **siempre como texto o valor**, nunca como fórmula.
  Además, los textos que empiezan con `= + - @` se prefijan con `'` (inyección de fórmulas al
  abrir en Excel).
- Credenciales SMTP solo por variables de entorno (`.env.docker`), nunca en la base ni en los logs.
- Los endpoints de administración (`PUT /alerts/rules`, `POST /alerts/run`,
  `POST /licenses/regenerate`) llevan `@Roles('super_admin','it_admin')`.
- Revisión ofensiva breve: la API no está expuesta a internet (red interna del MEF, detrás del SSO
  de `gti-app`). El vector realista es un usuario interno que sube un xlsx malformado, y queda
  cubierto por los topes y el parser sin evaluación de fórmulas.

### Planificación (lente condicional): **APROBADO**
El orden de fases es correcto. Las alertas dependen de las licencias (usan `renewalDate`), y las
licencias dependen de intangibles. El SMTP es una dependencia externa abierta (relay del MEF) que
no bloquea: sin SMTP, las alertas funcionan en la bandeja.

## VEREDICTO DEL CONCILIO: **APROBADO CON CAMBIOS**

### Cambios exigidos (aplicados en design.md, tasks.md, specs y proposal.md)
1. **H1:** el despliegue fuerza la instalación de dependencias. Tarea explícita de ejecutar
   `docker compose -f docker-compose.server.yml run --rm api npm ci --include=dev` (o eliminar el
   volumen `api_node_modules`) antes de reiniciar la API. Queda en el Migration Plan. El
   `command` de la imagen no se toca, por la deuda de desincronización con el servidor ya
   registrada en ESTADO.
2. **H2/H3:** la migración agrega `perpetual` a `LicenseType` y `retired` a `LicenseStatus`.
3. **H4:** el KPI del Dashboard excluye `status='retired'` y devuelve además `intangibleSeats`
   para mostrar el desglose. Hay test de regresión.
4. **H5:** proveedor fuera de "Campos distintos"; solo informativo en el detalle.
5. **H6:** `po_year` = año de `fecha_alta` (SIGA) y de FECHA DE ALTA (Excel). La tarea 2.1 queda
   resuelta.
6. **H7/H8:** `@types/multer` en devDependencies y DTO `UploadCoordinatorDto { cutDate: IsDateString }`.
7. **H9:** "Solo en SIGA" separado en vigentes y bajas.
8. **Seguridad:** tope de filas y hojas, nombre de archivo saneado, exportación sin fórmulas y con
   prefijo anti-inyección, y roles en los endpoints de administración.
9. **Simplicidad:** comparación siempre vigente vs vigente en la UI; una sola fila de reglas de
   alerta por tenant.

### Mayor riesgo y mitigación
**Romper la API en producción al desplegar**, porque las dependencias nuevas no se instalan en el
volumen persistente (H1). Mitigación: paso explícito de `npm ci` en el runbook de despliegue,
verificado con `docker compose logs api` y el healthcheck `/api/v1/health/ready` antes de dar el
despliegue por terminado. El rollback es volver a la imagen y el commit anteriores.

### Qué reutilizar
El patrón de conexión de `import-siga.ts`, `RolesGuard`/`@Roles`, `AuditLog`, `apiFetch`, la tabla
de `assets/page.tsx` y `FileInterceptor` de `@nestjs/platform-express`. Se descarta portar Vencix,
porque su stack es distinto (Express + SQLite).

### ADR
`adr/ADR-001-intangibles-versionados-y-alertas.md`: el modelo de versiones por fuente y corte, y
el scheduler dentro de la API (dependencias estructurales nuevas).
