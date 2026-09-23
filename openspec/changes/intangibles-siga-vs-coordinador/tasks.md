## 1. Esquema

- [x] 1.1 Fase 1: modelos `IntangibleBatch` e `IntangibleRecord` (D1) en `schema.prisma`. Los enums de licencias, `origin`/`originKey` y las tablas de alertas van en la migración de su fase (5.0 y 6.0), para que cada fase se despliegue sola
- [x] 1.2 Migraciones `20260923120000_intangibles` (tablas + índice único parcial de una versión vigente por fuente) y `20260923130000_intangibles_coordinator_versions` (el coordinador puede subir varias versiones del mismo corte; la unicidad por corte queda solo para SIGA). Sin `unaccent`: la normalización se hace en la aplicación y con `upper`/`regexp_replace`
- [x] 1.3 Verificar que la migración aplica limpia sobre una copia de la base `comptrol` local y que `assets` y `software_licenses` no pierden filas

## 2. Carga de intangibles de SIGA

- [x] 2.1 Regla de `po_year` resuelta por el concilio (H6): año de `fecha_alta` en ambos lados; `ano_eje` no sirve
- [x] 2.2 Crear `apps/importer/scripts/import-siga-intangibles.ts` (grupo 14, clase 04, sec_ejec 46, incluidas las bajas; join a `sig_contratistas` para `nombre_prov`/`nro_ruc`; OC 0 → NULL) con `SIGA_CUT_DATE` obligatorio y `SIGA_REPLACE`
- [x] 2.3 Agregar el script `import:siga-intangibles` en `apps/importer/package.json` y en el `package.json` raíz
- [x] 2.4 Correrlo en local y verificar: 10,120 registros (9,986 vigentes, 134 baja), `assets` sin cambios y rechazo al repetir el mismo corte

## 3. Subida del Excel del coordinador (API)

- [x] 3.1 Agregar `exceljs` (dependencies) y `@types/multer` (devDependencies) a `apps/api`, verificando que queden en `apps/api/package-lock.json`; crear el módulo `intangibles` (module, controller, service)
- [x] 3.2 Parser: detección de hoja por encabezados normalizados, mapeo de las 25 columnas, normalización de CONDICIÓN, OC 0 → NULL, advertencias por fila (sin código, repetido, fecha ilegible); topes de 50,000 filas y 20 hojas
- [x] 3.3 `POST /intangibles/batches/coordinator` (multipart, 20 MB, `.xlsx` + firma ZIP, `UploadCoordinatorDto` con `cutDate` `@IsDateString`, nombre de archivo saneado) → crea el batch vigente y registra en `audit_logs`. La regeneración de licencias se engancha en la fase 2 (tarea 5.2)
- [x] 3.4 `GET /intangibles/batches` y `POST /intangibles/batches/:id/make-current`
- [x] 3.5 Tests del parser con el Excel real: 9,986 filas; condiciones unificadas; falta de columna obligatoria → rechazo con la lista; archivo no xlsx → 400; archivo que supera el tope de filas → rechazo sin crear versión

## 4. Listado y comparación (API)

- [x] 4.1 `GET /intangibles` (batch SIGA vigente + datos del coordinador vigente; búsqueda, filtros por estado, condición, vencimiento y cuenta sospechosa; paginación) y `GET /intangibles/:code`
- [x] 4.2 `IntangiblesReconciliationService` con SQL: solo-SIGA (vigentes y bajas por separado), solo-Excel, campos distintos (sin proveedor), cantidades por OC, pendientes, vencimientos, marca de cuenta y aviso de cortes
- [x] 4.3 `GET /intangibles/reconciliation/summary` y `GET /intangibles/reconciliation/:view`
- [x] 4.4 `GET /intangibles/reconciliation/:view/export` (xlsx con cabecera de cortes; celdas nunca como fórmula y prefijo `'` en textos que empiezan con `= + - @`; "Pendientes" con las 25 columnas originales + Motivo)
- [x] 4.5 Verificar los conteos de la spec con los datos reales: solo-Excel 0, solo-SIGA 0 vigentes + 134 bajas, OC 0 vs NULL sin diferencia, 932 sin condición, 2,241 definida sin vencimiento, 2,602 vencidos, 2,000 cuenta sospechosa

## 5. Licencias desde intangibles (fase 2)

- [x] 5.0 Migración `20260923150000_licenses_from_intangibles`: `perpetual` en `LicenseType`, `retired` en `LicenseStatus`, columnas `origin`/`origin_key` en `software_licenses` con índice único parcial. Probada primero en una copia de `comptrol` (142 licencias manuales intactas)

- [x] 5.1 `LicensesFromIntangiblesService.regenerate` (agrupación por `origin_key`, upsert `origin='intangibles'`, retirada de grupos sin vigentes, mapeo de `licenseType`/`status`)
- [x] 5.2 Llamarlo desde el script de SIGA, la subida del Excel y el cambio de versión vigente; agregar `POST /licenses/regenerate` (super_admin, it_admin). `import:docs` ahora borra solo licencias `origin='manual'` (antes, con `IMPORT_RESET` o por nombre, se habría llevado también las de intangibles)
- [x] 5.3 Dashboard: el KPI de licencias excluye `status='retired'` y devuelve `intangibleSeats`; la tarjeta muestra el desglose
- [x] 5.4 `GET /licenses` y `GET /licenses/:id/intangibles`
- [x] 5.5 Tests: idempotencia (dos corridas iguales), una licencia `origin='manual'` intacta, "MICROSOFT PROJECT PROFESIONAL" → 19 asientos; regresión del KPI del Dashboard. Correrlos solo contra la base local o una copia, nunca contra staging

## 6. Alertas (fase 3)

- [ ] 6.0 Migración de la fase 3: tablas `alert_rules` y `alerts` con el índice único de deduplicación

- [ ] 6.1 Agregar `@nestjs/schedule`; crear el módulo `alerts`
- [ ] 6.2 Generador: umbral más cercano cruzado, vencidas agrupadas por licencia, `ON CONFLICT DO NOTHING`, auto-resolve cuando cambia el vencimiento; cron diario 07:00 America/Lima + `POST /alerts/run`
- [ ] 6.4 `GET /alerts`, `GET /alerts/count`, `POST /alerts/:id/ack|dismiss` (registra quién y cuándo), `GET/PUT /alerts/rules` (una fila por tenant); `PUT /alerts/rules`, `POST /alerts/run` y `POST /licenses/regenerate` con `@Roles('super_admin','it_admin')`
- [ ] 6.5 Tests: sin duplicados en dos corridas, primera corrida agrupada, cambio de umbrales, auto-resolve

## 7. Web

- [x] 7.1 `/intangibles`: pestaña Listado (tabla paginada con búsqueda y filtros, fechas de corte visibles, marca de cuenta sospechosa)
- [x] 7.2 `/intangibles`: botón "Subir Excel" (archivo + fecha de corte sugerida desde el nombre, resultado con advertencias) y pestaña Versiones (historial y "hacer vigente")
- [x] 7.3 `/intangibles`: pestaña Comparación (seis vistas con conteo, aviso de cortes desfasados, exportar xlsx por vista)
- [x] 7.4 `/licenses`: lista con búsqueda y filtro por estado, y detalle con los bienes del grupo
- [ ] 7.5 `/alerts`: bandeja por estado, Atender/Descartar, configuración de reglas (solo admins)
- [ ] 7.6 `TopNav`: "Intangibles" y "Licencias" hechos; falta "Alertas (n)" con el contador (fase 3)
- [ ] 7.7 `tsc --noEmit` limpio en `apps/web` y `apps/api`; lint (fase 1: limpio en los archivos nuevos; `auth.service.spec.ts` y `main.ts` traen errores previos, no introducidos aquí)

## 8. Verificación y documentación

- [ ] 8.1 Recorrido completo en local: migración → carga de SIGA → subida del Excel → comparación → exportaciones → licencias → correr alertas
- [ ] 8.2 Escribir `docs/INTANGIBLES.md` (qué es cada vista, precedencia SIGA/Excel, cómo subir una nueva versión, cuándo pedir un corte nuevo de SIGA, alertas)
- [ ] 8.3 Runbook de despliegue: `docker compose -f docker-compose.server.yml run --rm api npm ci --include=dev` antes de `up -d api`; verificar los logs y `/api/v1/health/ready` (concilio H1)
- [ ] 8.4 Actualizar `ESTADO_PROYECTO.md` con el bloque nuevo
