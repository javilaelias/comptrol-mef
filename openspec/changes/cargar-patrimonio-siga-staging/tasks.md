## 1. Habilitar acceso a la base real sin mover el dump

- [ ] 1.1 Confirmar con el usuario el momento para recrear el contenedor `db` en staging (breve
      interrupción de Postgres) — no ejecutar 1.2 sin ese visto bueno explícito, aunque el resto
      del cambio ya esté aprobado por concilio.
- [ ] 1.2 Editar `docker-compose.server.yml` (repo local): agregar al servicio `db` el bloque
      `ports: ["127.0.0.1:5436:5432"]` (nunca sin el prefijo `127.0.0.1:`). Commitear y
      sincronizar al servidor con el mismo patrón `git archive` + extraer encima ya usado en
      MB1 (bloque SSO), sobre `/home/usr_admin/apps/Comptrol/docker-compose.server.yml`.
- [ ] 1.3 En el servidor (SSH), con `-f` explícito siempre (ese directorio no tiene
      `docker-compose.yml`): `docker compose -f docker-compose.server.yml up -d --force-recreate
      db`. Verificar `healthy` (`docker inspect comptrol-postgres --format
      '{{.State.Health.Status}}'` → `healthy`) y que el puerto quedó atado a `127.0.0.1:5436`,
      no a `0.0.0.0` (`docker port comptrol-postgres` debe mostrar `127.0.0.1:5436`).
- [ ] 1.4 Verificar que `comptrol-api` se recuperó de la recreación de `db`: `curl
      http://localhost:3001/api/v1/health/ready` desde el servidor devuelve `200` — no asumir
      que Prisma reconectó solo.
- [ ] 1.5 Abrir el túnel SSH local (`ssh -L 5436:127.0.0.1:5436 usr_admin@10.118.67.55`) y
      verificar conexión: `psql postgresql://postgres:postgres@localhost:5436/comptrol -c
      "select 1"` responde sin error.

## 2. Dry-run y verificación

- [ ] 2.1 Correr `SIGA_DRY_RUN=1 npm run import:siga` con `DATABASE_URL` apuntando al túnel
      (`localhost:5436/comptrol`) y `SIGA_DATABASE_URL` sin cambios (local). Capturar el resumen
      completo (conteos + tabla de ejemplos).
- [ ] 2.2 Comparar el resumen contra `docs/IMPORTACION_SIGA.md` (34,207 activos totales, 3,245
      responsables, distribución por tipo/estado). Si difiere de forma significativa, DETENERSE y
      entender por qué antes de seguir (no continuar a la tarea 3).
- [ ] 2.3 Verificar por consulta directa (vía el mismo túnel) que el tenant `mef` que ve el
      import es el mismo que usan los usuarios SSO reales: `select id, slug from tenants where
      slug = 'mef'` debe devolver una sola fila, la misma que ya usan los usuarios JIT-provisionados
      del bloque SSO recién cerrado.

## 3. Corrida real (requiere confirmación explícita)

- [ ] 3.1 Mostrar el resumen del dry-run (tarea 2.1) al usuario y pedir confirmación explícita
      para escribir contra la base real — este paso NO se ejecuta solo porque el concilio aprobó
      el diseño; necesita luz verde en el momento.
- [ ] 3.2 Con confirmación: correr `SIGA_DRY_RUN=0 npm run import:siga` contra el mismo túnel.
      Verificar que el proceso termina con el resumen final (activos creados/actualizados) sin
      errores.
- [ ] 3.3 Verificar en la app real: entrar a Comptrol-MEF (portal OPDA Apps, SSO) y confirmar que
      el dashboard "Activos" ya no muestra 0 — el total debe acercarse al del dry-run.
- [ ] 3.4 Cerrar el túnel SSH. Dejar el puerto del servidor tal como quedó en la tarea 1.2 (atado
      a loopback, no se revierte — ver design.md, D1) para que una futura re-sincronización de
      SIGA no tenga que repetir este mini-bloque de infraestructura.

## 4. Cierre

- [ ] 4.1 Actualizar `docs/IMPORTACION_SIGA.md` si los conteos reales de staging difirieron de
      los de la corrida local documentada (mantener el doc como fuente de verdad del último
      estado real, no de la corrida de desarrollo).
- [ ] 4.2 Crear `ESTADO_PROYECTO.md` conciso en la raíz de `D:\MV\Comptrol-MEF` (primer cambio
      formal de este repo en la fábrica) con el estado post-import.
- [ ] 4.3 Commit de los archivos ya existentes en el working tree (`import-siga.ts`, cambios de
      `README.md`/`.env.example`/`package.json`, `docs/IMPORTACION_SIGA.md`) + los artefactos de
      este cambio (`openspec/changes/cargar-patrimonio-siga-staging/`, `ESTADO_PROYECTO.md`) —
      commit separado del cierre del bloque SSO (ya cerrado y pusheado aparte). NO push
      automático: confirmar con el usuario antes de pushear, mismo criterio que el resto de la
      sesión.
- [ ] 4.4 Archivar el cambio (`openspec archive`) tras QA.
