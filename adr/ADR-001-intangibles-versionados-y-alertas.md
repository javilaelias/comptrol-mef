# ADR-001 — Intangibles versionados por fuente y corte, y alertas con scheduler dentro de la API

**Estado:** aceptada
**Fecha:** 2026-09-23
**Aprobación:** veredicto del concilio en
`openspec/changes/intangibles-siga-vs-coordinador/concilio.md` (APROBADO CON CAMBIOS).

## Contexto

Los intangibles del MEF llegan de dos fuentes que se actualizan por separado y en fechas
distintas: los cortes de SIGA (dump de 5.9 GB, por script) y el Excel del coordinador de
infraestructura (subido desde la pantalla). El usuario quiere comparar las dos, ver qué cambió
entre versiones y recibir alertas de vencimiento, y deja de usar Vencix, que era quien daba esas
alertas. Hasta ahora Comptrol no tenía scheduler, correo ni subida de archivos.

## Decisión

1. Cada carga, de cualquiera de las dos fuentes, es una **versión inmutable**
   (`intangible_batches` + `intangible_records`) con su fecha de corte y una marca de "vigente" por
   fuente. La comparación se hace siempre entre dos versiones.
2. Las alertas se generan con un **cron dentro de la API** (`@nestjs/schedule`). La
   deduplicación la garantiza un índice único en la base de datos, y el correo es opcional por
   SMTP (`nodemailer`).

## Alternativas consideradas

- **Tabla maestra de intangibles actualizada en sitio:** más simple, pero pierde el historial y
  el "qué cambió", que se pidió de forma explícita.
- **Intangibles dentro de `assets`:** distorsiona el Dashboard, el e-Waste y los tipos de activo
  de equipos. Descartado por el usuario.
- **Cron externo (crontab del servidor, o un contenedor aparte):** agrega una pieza de
  infraestructura más en un servidor cuyo compose ya está desincronizado del repo. Con una sola
  réplica de la API, el cron interno es suficiente, y el índice único lo mantiene correcto si algún
  día hay más réplicas.
- **Portar el módulo de alertas de Vencix:** su stack es distinto (Express + SQLite), así que no
  se puede reutilizar tal cual.

## Consecuencias

- Se gana historial completo y comparación reproducible entre cualquier par de versiones.
- Cada versión ocupa unas 10k filas. El crecimiento es lineal y bajo; se puede agregar una purga de
  versiones antiguas si hiciera falta.
- La API pasa a tener tres dependencias estructurales (`exceljs`, `@nestjs/schedule`,
  `nodemailer`). Como `node_modules` vive en un volumen persistente del servidor, cada dependencia
  nueva exige forzar `npm ci` al desplegar (ver el runbook del cambio).
- Los valores `perpetual` y `retired`, agregados a los enums de licencias, no se pueden quitar
  fácilmente en Postgres.
