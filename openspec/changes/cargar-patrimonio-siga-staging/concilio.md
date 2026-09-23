# Concilio — cargar-patrimonio-siga-staging

**Profundidad:** 5 revisores + lente de seguridad (obligatorio — escritura masiva a producción,
primer OpenSpec de este repo, requiere recrear un contenedor de base de datos real).

**Verificación contra el código y el servidor real** (no solo contra el resumen de la propuesta):
`apps/api/prisma/schema.prisma` (modelo `Asset`, `Tenant`, `User`), `apps/api/src/modules/auth/
auth.service.ts`, `docker-compose.yml`, `docker-compose.server.yml`, y SSH de solo lectura contra
`10.118.67.55` (`docker inspect`, `docker exec ... psql`). Esta verificación encontró un error de
fondo en el `design.md` original — ver Hallazgo 1.

---

## Hallazgo 1 (crítico, corrige la propuesta): el compose real de producción no es el que se leyó

`design.md` (D1) decía *"aplicar el mapeo de puerto que el propio `docker-compose.yml` ya
declara"* — pero `docker inspect comptrol-postgres` muestra que el contenedor real fue creado por
el proyecto compose **`comptrol`**, `working_dir=/home/usr_admin/apps/Comptrol`,
`config_files=docker-compose.server.yml,docker-compose.override.yml`. Es decir: producción usa
**`docker-compose.server.yml`**, no `docker-compose.yml` (que es solo para desarrollo local, no
existe en el servidor). Y `docker-compose.server.yml` — verificado leyendo el archivo real — **no
tiene ningún bloque `ports:` para `db`**, igual que confirma `docker inspect` (`{"5432/tcp":null}`).

Además, `docker-compose.override.yml` (el segundo archivo que sí se usó al crear el contenedor el
2026-08-19) **ya no existe en el servidor** (`ls /home/usr_admin/apps/Comptrol/` solo muestra
`docker-compose.server.yml` y `.env`) — su contenido se perdió, no se puede saber qué agregaba.

**Por qué importa:** la propuesta original decía que solo se iba a "aplicar una intención ya
declarada" (bajo riesgo, texto que ya existía). Eso es falso — es agregar un `ports:` **nuevo**
que nunca existió en el archivo que realmente gobierna producción. Es un cambio real al compose
de producción, no una formalidad. Además, si alguien hubiera usado por error el
`docker-compose.yml` de desarrollo (que sí tiene `"${DB_HOST_PORT:-5436}:5432"`, **sin** atar a
`127.0.0.1` — publica en todas las interfaces por defecto), el puerto habría quedado expuesto a
toda la red, no solo por túnel SSH. Ese habría sido un hallazgo de seguridad real si no se
hubiera verificado contra el servidor.

**Cambio exigido** (aplicado en este veredicto, ver más abajo): editar `docker-compose.server.yml`
del repo (commitear + sincronizar al servidor con el mismo patrón `git archive` ya usado en MB1)
para agregar, en el servicio `db`:
```yaml
ports:
  - "127.0.0.1:5436:5432"
```
Explícitamente atado a loopback — nunca el formato sin prefijo de host. Comando de recreación
siempre con `-f` explícito: `docker compose -f docker-compose.server.yml up -d --force-recreate
db` (nunca `docker compose up` a secas, que buscaría un `docker-compose.yml` que no existe ahí,
o podría ambigüar con otro proyecto).

**Residual, aceptado:** no se puede recuperar qué agregaba `docker-compose.override.yml` perdido.
El servicio `db` en sí es simple (imagen oficial, env fijo, volumen nombrado, healthcheck) — bajo
riesgo de que el override cambiara algo crítico de ESE servicio en particular. Se documenta como
riesgo conocido, no bloqueante.

---

## Arquitecto

**Arquitectura de software — APROBADO.** El enfoque (túnel SSH en vez de mover 5.9 GB) es
correcto y el patrón de reutilización de conexión ya es consistente con cómo se hicieron las
verificaciones de solo lectura del bloque SSO recién cerrado. El script `import-siga.ts` ya
existe, probado, con manejo cuidadoso de casos borde (series duplicadas, nombres con tildes
distintas, `dryRun`) — no hay necesidad de reescribir nada, solo de conectarlo al destino
correcto.

**Arquitectura de solución — APROBADO CON CAMBIOS.** Ver Hallazgo 1: el diseño de acceso a la
base real estaba fundamentado en el archivo equivocado. Con la corrección (editar
`docker-compose.server.yml`, atar a loopback, comando explícito con `-f`), la solución es sólida
y de bajo riesgo operativo (mismo volumen, mismo healthcheck, mismo patrón de redeploy que MB1).

## Reutilización

**APROBADO.** No hay nada en el registro (`D:\JuvinFactory\registro\`) que resuelva esto — es
trabajo específico de este repo. El script de import, la documentación de resultados esperados,
y el patrón de acceso SSH de solo lectura ya usado en el bloque SSO se reutilizan correctamente
en vez de reinventarse. `@@unique([tenantId, assetTag])` y `@@unique([tenantId, serialNumber])`
verificados en `schema.prisma` — el `upsert` por `tenantId_assetTag` del script es válido contra
el esquema real, no una suposición.

## Producto/UX

**APROBADO.** El alcance es correcto: resolver el "Activos: 0" real que el usuario encontró al
entrar por primera vez al portal. No agrega alcance de más (no toca UI, no agrega tipos de
activo nuevos) — es exactamente lo necesario para que el dato ya trabajado llegue a donde el
usuario lo necesita ver.

## Riesgo/QA

**APROBADO CON CAMBIOS.** Dos correcciones:

1. **Rollback incompleto** (punto 4 pedido en la convocatoria): `design.md` proponía
   `DELETE FROM assets WHERE fingerprint LIKE 'siga:%'` como "el" rollback, pero eso deja
   huérfanos: los 3,245 `User` con `ssoProvider='siga'` (email `siga-*@siga.local`), y cualquier
   `OrgUnit`/`Location`/`Site` que el import haya creado y que quede sin ningún activo
   referenciándola. **Corrección exigida:** documentar el rollback completo (tres pasos: borrar
   assets por fingerprint → borrar `OrgUnit`/`Location` con `_count.assets = 0` Y que el import
   haya creado (mismo criterio `SIGA-` en `code` que usa el propio script para su limpieza
   interna) → borrar `User` con `ssoProvider = 'siga'`), no solo el primer paso. Aplicado abajo.
2. **Verificación de recuperación del `api` tras recrear `db`:** el diseño ya reconocía el
   blip de conexión pero no lo verificaba. Se agrega una tarea explícita: después de recrear
   `db`, confirmar `GET http://localhost:3001/api/v1/health/ready` (vía el propio `comptrol-api`)
   vuelve a `200` antes de seguir — no asumir que Prisma reconectó solo.

No se pide backup adicional de `comptrol-postgres` antes de escribir: el argumento de
idempotencia (`upsert` por clave única, nunca `DELETE`) es válido y suficiente — un backup extra
sería trabajo sin beneficio real dado que la operación no es destructiva.

## Simplicidad

**APROBADO.** La alternativa descartada (mover 5.9 GB al servidor) habría sido más simple de
*explicar* pero mucho más cara en la práctica (horas de transferencia). El túnel SSH es la
versión más chica que realmente funciona, no una sobre-ingeniería — reutiliza un mecanismo
(acceso SSH) que el proyecto ya tiene, sin agregar infraestructura nueva más allá de una línea de
`ports:` en un compose que ya existe.

## Seguridad (lente condicional — obligatorio por tocar infraestructura y datos reales)

**APROBADO CON CAMBIOS** (cambios ya cubiertos por el Hallazgo 1 y por Riesgo/QA).

- El puerto debe atarse a `127.0.0.1`, nunca `0.0.0.0` — confirmado como cambio exigido arriba.
  Sin esa corrección, el hallazgo habría sido RECHAZADO en este lente.
- **Observación no bloqueante:** `POSTGRES_PASSWORD=postgres` (contraseña trivial) es una
  condición preexistente, no introducida por este cambio — pero al abrir el túnel se vuelve
  alcanzable por cualquiera con la llave SSH del servidor (que de todas formas ya tiene acceso
  profundo vía `docker exec`, así que el incremento real de superficie es marginal). Se anota
  como deuda pendiente, mismo patrón que la rotación de `LDAP_BIND_PASSWORD`/`AUTH_JWT_SECRET` ya
  trackeada en `gti-app` — no bloquea este cambio, pero se dice explícitamente en vez de callarlo.
- Revisión ofensiva breve: con el puerto atado a loopback y sin publicar a la red, un atacante
  externo sin la llave SSH no gana ninguna superficie nueva. Un atacante que YA tiene la llave
  SSH del servidor ya podría llegar a la base por `docker exec` de todas formas — el túnel no
  abre una puerta que no existiera ya para ese actor.

---

## VEREDICTO DEL CONCILIO: APROBADO CON CAMBIOS

**Cambios exigidos (ya aplicados a `design.md`/`tasks.md` en este mismo veredicto, no quedan
como nota suelta):**

1. Corregir D1 en `design.md`: el archivo real de producción es `docker-compose.server.yml`
   (`/home/usr_admin/apps/Comptrol/`), no `docker-compose.yml`. El `ports:` es un agregado nuevo,
   no la aplicación de algo ya declarado. Atado explícitamente a `127.0.0.1:5436:5432`.
2. `tasks.md` 1.2: editar y commitear `docker-compose.server.yml` (agregar el bloque `ports` al
   servicio `db`), sincronizar al servidor (mismo patrón `git archive` de MB1), y recrear con
   `docker compose -f docker-compose.server.yml up -d --force-recreate db`.
3. `tasks.md`, nueva tarea 1.4: verificar `GET http://localhost:3001/api/v1/health/ready` en
   `comptrol-api` vuelve a `200` después de recrear `db`.
4. `design.md`, sección Migration Plan/Rollback: completar el rollback con los tres pasos
   (assets → orgUnits/locations huérfanas → usuarios `ssoProvider='siga'`), no solo el DELETE de
   assets.

**Mayor riesgo:** editar y recrear el contenedor de base de datos de producción sin el archivo
`docker-compose.override.yml` original (perdido) — mitigado porque el servicio `db` en sí es
simple y el cambio real (agregar `ports`) es aditivo, no reemplaza nada del servicio.

**Reutilizar del registro:** nada aplicable — es trabajo específico de este repo, ya correctamente
apoyado en el script/documentación existentes en vez de reescribirse.

**Siguiente paso:** aplicar los 4 cambios exigidos a `design.md`/`tasks.md`, luego JuvinDev
ejecuta `tasks.md` en orden — con el gate explícito de la tarea 3.1 (confirmación del usuario
antes de la escritura real) intacto.
