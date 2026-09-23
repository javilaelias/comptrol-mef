## Why

El módulo "Activos" de Comptrol-MEF ya está en producción real (staging, `10.118.67.55`, integrado
al portal OPDA Apps con SSO desde hoy) pero muestra 0 activos. Existe un importador completo y
funcional (`apps/importer/scripts/import-siga.ts` + `docs/IMPORTACION_SIGA.md`), ya probado con
resultados reales documentados (34,207 activos, 3,245 responsables) — pero corrido solo contra una
base de datos **local** de desarrollo. Nunca se ejecutó contra la base real de staging
(`comptrol-postgres`), así que el trabajo real del MEF nunca llegó a la app que el usuario y su
equipo van a usar.

## What Changes

- Definir un mecanismo de acceso seguro desde el entorno donde corre el import hacia
  `comptrol-postgres` de staging (red interna del docker-compose, no expuesta al host) — sin
  copiar el dump completo de SIGA al servidor si se puede evitar.
- Verificar con `SIGA_DRY_RUN=1` contra la base real de staging antes de escribir nada, comparando
  el resumen contra los números ya documentados en `docs/IMPORTACION_SIGA.md` (34,207 activos,
  3,245 responsables, etc.) para confirmar que el import ve la misma foto que la corrida local.
  Confirmar además que el tenant `mef` que usa el importador (`TENANT_SLUG = 'mef'`, fijo en el
  script) es el MISMO tenant que ya usan los usuarios reales SSO (verificado por código:
  `auth.service.ts:108` hace `tenant.findFirst({ where: { slug: 'mef' } })` para el JIT
  provisioning de MB2/MB4, ya probado en producción hoy) — no un tenant nuevo separado.
  **BREAKING** en el sentido de que escribe/actualiza masivamente datos reales de producción
  (upsert por `assetTag`, no destructivo, pero de gran volumen).
- Ejecutar la corrida real (`SIGA_DRY_RUN=0`) solo con confirmación explícita del usuario en el
  momento, después de que el dry-run haya sido revisado.
- Inicializar `openspec/` en este repo (primer cambio formal de Comptrol-MEF en la fábrica).

## Capabilities

### New Capabilities
- `asset-inventory-siga-import`: carga y actualización del inventario de activos de Comptrol-MEF
  desde el patrimonio de SIGA, incluyendo el requisito de que la corrida contra una base de
  producción pase por verificación (dry-run) y confirmación explícita antes de escribir.

### Modified Capabilities
(ninguna — no hay specs previas en este repo, es la primera capability formal)

## Impact

- **Afecta:** base de datos `comptrol-postgres` de staging (escritura masiva de `Asset`, `User`
  read-only para responsables, `OrgUnit`, `Location`, `Site` — según `import-siga.ts`). No toca
  código de la app (el script ya existe y está probado), no toca el contrato SSO cerrado hoy.
- **No afecta:** `gti-app` (proyecto aparte, su bloque de integración SSO ya está cerrado y no se
  reabre acá), ni el esquema de Prisma (no hay migración nueva, el modelo `Asset`/`Tenant`/etc. ya
  existe).
- **Riesgo real:** escritura de ~34 mil filas contra una base con datos institucionales reales del
  MEF. Mitigado por: dry-run obligatorio antes de la corrida real, y confirmación explícita del
  usuario para el paso de escritura (no se autoejecuta solo porque el concilio aprobó el diseño).
