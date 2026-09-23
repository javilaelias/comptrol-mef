# Concilio — activos-columnas-configurables-origen-siga

**Profundidad:** 2 revisores (Reutilización + Riesgo/QA), con los dos sub-veredictos de
Arquitectura (software/solución) explícitos por tratarse de una decisión de stack real.

**Verificación contra el código real:** `apps/api/src/modules/assets/assets.controller.ts`,
`assets.service.ts`, `apps/api/prisma/schema.prisma` (modelo `User`), `apps/importer/scripts/
import-siga.ts`, `apps/web/package.json`, `apps/web/src/app/assets/page.tsx` y `[id]/page.tsx`.

---

## Hallazgo 1 (crítico — seguridad, corrige la propuesta): `owner: true` filtraría `passwordHash`

`tasks.md` 1.1 pedía agregar `owner: true` al `include` de `AssetsService.list()`. Verificado
contra `assets.controller.ts`: **no hay `ClassSerializerInterceptor` ni ningún sanitizado global**
— el controller hace `return this.assets.list(...)` directo, y Nest serializa el objeto de Prisma
tal cual a JSON. El modelo `User` (`schema.prisma:150-171`) tiene `passwordHash String?` como
campo escalar normal — `include: { owner: true }` (que trae TODOS los escalares) lo expondría en
la respuesta de `GET /assets` para cualquier activo con responsable asignado.

**Para los 3,245 usuarios `siga-*@siga.local`** (creados por el import ya cerrado)
`passwordHash` es `null` (el script no lo setea) — sin impacto ahí. **Pero cualquier usuario real
con contraseña propia** (cuentas admin/manuales del sistema, `passwordHash` con hash bcrypt real)
que en algún momento quede como `ownerUserId` de un activo, filtraría su hash de contraseña real
en una respuesta HTTP autenticada solo por JWT de tenant, sin control adicional.

**Nota aparte, no bloqueante para este cambio:** `getById`/`getByAssetTag` (`assets.service.ts:
88-104`) YA hacen `include: { ..., owner: true }` hoy, en producción — el mismo problema ya existe
en el endpoint de detalle. No se corrige acá (fuera del alcance de este cambio, que es agregar
`owner` al LISTADO), pero se deja anotado como deuda de seguridad real a nivel de todo el módulo
de assets — debería tratarse como ítem propio, no como nota perdida.

**Cambio exigido:** reemplazar `include: { owner: true }` por un `select` explícito con
allowlist (`id`, `fullName`, `email` — nunca `passwordHash`, `ssoProvider` no hace falta en la
UI) en el listado. Aplicado abajo a `design.md`/`tasks.md`.

## Hallazgo 2 (simplicidad — corrige la propuesta): `@tanstack/react-table` es más de lo que este pedido necesita

El pedido del usuario es exactamente tres cosas: toggle de columnas visibles, scroll horizontal
para las que no entran (ya existe, `overflow-x-auto` ya está en el archivo), y persistencia local.
Ninguna requiere sorting, filtering, ni virtualización — las features reales de una librería de
tablas. La paginación de esta pantalla ya es manual (`skip`/`take` contra la API, sin librería).
Agregar `@tanstack/react-table` solo para un `Record<string, boolean>` de visibilidad es traer una
dependencia nueva (con su superficie de mantenimiento, versiones, breaking changes futuros) para
resolver algo que el propio patrón ya usado en el archivo (`useState` + filtro condicional de
columnas al renderizar `<th>`/`<td>`) resuelve igual de bien, con menos código nuevo para quien
mantenga esto después sin conocer la librería.

**No es un rechazo del enfoque headless en general** — si mañana este proyecto necesita sorting,
filtros por columna o virtualización de miles de filas, ahí sí se justifica. Hoy no.

**Cambio exigido:** quitar la dependencia nueva; implementar `columnVisibility` como
`Record<string, boolean>` en estado de React, igual patrón que el resto del archivo. Aplicado
abajo.

---

## Reutilización

**APROBADO CON CAMBIOS** (ver Hallazgo 2). El resto reutiliza bien lo que ya existe:
`overflow-x-auto` ya presente, patrón de `useState`/`useEffect` ya usado en la misma página,
`fingerprint` ya escrito por el importador sin necesidad de tocar el esquema (D2 verificado
correcto contra `import-siga.ts:31,427`).

## Arquitectura de software

**APROBADO CON CAMBIOS.** Sin la librería nueva, el cambio es aún más simple de lo que proponía
el diseño original: un array de definición de columnas + un `Record` de visibilidad + persistencia
en `localStorage` con `try/catch` (ya es el patrón que la guía de artefactos/otros módulos usan
para storage por-viewer). No introduce acoplamiento nuevo, es consistente con el resto del
archivo.

## Arquitectura de solución

**APROBADO CON CAMBIOS.** Sin la dependencia nueva, cero costo de mantenimiento adicional, cero
riesgo de incompatibilidad de versiones con Next.js 16 / React 19 (`@tanstack/react-table` recién
sale de release candidate en algunas versiones del ecosistema — otro motivo más para no traerlo
sin necesidad real).

## Riesgo/QA

**APROBADO CON CAMBIOS** (ver Hallazgo 1 — el único riesgo real y bloqueante de este cambio).
El resto de tasks.md ya contempla verificación manual razonable (5.2) para un cambio de UI de
solo lectura; no hace falta backup ni ventana de mantenimiento (no escribe nada, no toca
staging directamente — se implementa y prueba local, se despliega cuando el usuario lo pida,
mismo patrón que el resto del repo).

---

## VEREDICTO DEL CONCILIO: APROBADO CON CAMBIOS

**Cambios exigidos (ya aplicados a `design.md`/`tasks.md`, no quedan como nota suelta):**

1. `owner` en el listado se trae con `select: { id: true, fullName: true, email: true }`, nunca
   `include: { owner: true }` — evita filtrar `passwordHash`.
2. Se quita `@tanstack/react-table` de la propuesta. `columnVisibility` se implementa como estado
   de React (`Record<string, boolean>`), mismo patrón ya usado en el archivo.

**Mayor riesgo:** el filtrado de `passwordHash` (Hallazgo 1) — ya mitigado con el `select`
explícito exigido arriba. El mismo problema en `getById`/`getByAssetTag` queda anotado como deuda
separada, no de este cambio.

**Reutilizar del registro:** nada aplicable — cambio acotado a este repo, ya apoyado en patrones
propios del archivo en vez de traer algo externo.

**Siguiente paso:** JuvinDev ejecuta `tasks.md` en el orden ya corregido.
