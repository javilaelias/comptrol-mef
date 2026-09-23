## Context

Verificado contra el código real (no asumido):
- `apps/web/src/app/assets/page.tsx`: tabla HTML plana, 6 columnas hardcodeadas
  (`assetTag`, `description`, `assetType`, `status`, ubicación, `orgUnit`), tipo
  `AssetListItem` declara solo esos campos. Ya tiene `overflow-x-auto` en el contenedor de la
  tabla (línea 186) — el scroll horizontal ya es el patrón usado, no hay que introducirlo.
- `apps/api/src/modules/assets/assets.service.ts:75-81` (`list()`): usa `include` (no `select`),
  así que el backend YA devuelve todos los campos escalares de `Asset` — el recorte a 6 columnas
  es puramente del frontend (el tipo `AssetListItem` sub-declara lo que llega). Única falta real:
  `owner` no está en el `include` del listado (sí en `getById`/`getByAssetTag`, línea 94/102).
- `apps/web/package.json`: sin librería de tablas, sin `next-intl`/`next-themes` — no hay
  infraestructura de i18n/tema en NINGÚN módulo del repo hoy (verificado por grep, cero
  resultados). Mismo hallazgo que ya documentó `gti-app` para su módulo de Gobernanza de IA.
- `import-siga.ts:427` (ya cerrado): todo activo de SIGA lleva
  `fingerprint: siga:<sec_ejec>-<modalidad>-<secuencia>` — señal de origen ya disponible sin
  tocar el esquema.

## Goals / Non-Goals

**Goals:**
- Ver cualquier campo del activo desde la lista, no solo los 6 actuales.
- Saber de un vistazo si un activo viene de SIGA.

**Non-Goals:**
- No se agrega edición inline de columnas (la edición ya existe en el detalle, `/assets/[id]`,
  no se toca).
- No se implementa ES/EN ni tema oscuro en este cambio — **desviación documentada, no
  bloqueante**: esa infraestructura no existe en ningún módulo de Comptrol-MEF hoy (mismo
  hallazgo ya aceptado en `gti-app`/Gobernanza de IA); construirla es un cambio transversal
  aparte, no algo a decidir dentro de este ítem acotado.
- No se pagina la tabla por columnas ni se usa un modal de "más columnas" — el pedido explícito
  del usuario es scroll horizontal, no otro mecanismo.

## Decisions

**D1 — Estado de React (`Record<string, boolean>`), sin librería nueva.**
**Corregido tras concilio:** el pedido real (toggle de visibilidad + scroll horizontal, que ya
existe) no necesita sorting, filtrado ni virtualización — las razones de ser de una librería de
tablas. Traer `@tanstack/react-table` para resolver solo un `Record<string, boolean>` es más
dependencia de la que el problema justifica, y la paginación de esta misma pantalla ya es manual
(`skip`/`take` sin librería) — meter una librería para columnas pero no para paginación sería
inconsistente. Se implementa con el mismo patrón que ya usa el archivo: un array de definición de
columnas (`key`, `label`, `group`, `defaultVisible`) + `useState<Record<string, boolean>>` para
la visibilidad + filtrado condicional al renderizar `<th>`/`<td>`.

**Arquitectura de software:** cero acoplamiento nuevo — mismo patrón `useState`/render condicional
que el resto del archivo, sin conceptos nuevos para quien mantenga esto después.

**Arquitectura de solución:** cero dependencias nuevas, cero riesgo de incompatibilidad de
versiones con Next.js 16 / React 19.

**D2 — Indicador de origen por `fingerprint`, no por `source`.**
`source` (`AssetSource`) tiene el valor `api_import` que hoy solo escribe el importador de SIGA,
pero es un enum genérico — un futuro import de otro origen (ej. un discovery agent) también
podría usar `api_import` y volvería ambiguo el badge. `fingerprint?.startsWith('siga:')` es la
señal específica y ya inequívoca, sin tocar el esquema.

**D3 — Columnas visibles por defecto = las 6 actuales + Responsable.**
No se muestran las ~24 restantes por defecto (evita romper el hábito visual de quien ya usa la
pantalla) — se agregan al selector de columnas, ocultas hasta que el usuario las active. El
selector agrupa las columnas para que no sea una lista plana de 30 ítems (ej. "Identificación",
"Ubicación/Responsable", "Compra y garantía", "Hardware", "Auditoría").

## Risks / Trade-offs

- **[Riesgo] Con muchas columnas activas, la tabla se vuelve ancha e incómoda** → **Mitigación:**
  es el comportamiento pedido explícitamente por el usuario (scroll horizontal en vez de ocultar
  filas o paginar columnas) — no se mitiga distinto porque no es un defecto, es el diseño pedido.
- **[Riesgo — crítico, corregido por concilio] `include: { owner: true }` filtra
  `passwordHash`.** `assets.controller.ts` no tiene `ClassSerializerInterceptor` ni sanitizado
  alguno — devuelve el objeto de Prisma tal cual a JSON. `User.passwordHash` es un campo escalar
  normal; `include: { owner: true }` lo trae completo. Para los usuarios `siga-*@siga.local` es
  `null` (sin impacto), pero cualquier usuario real con contraseña propia que sea responsable de
  un activo filtraría su hash real. **Mitigación (exigida):** `select: { id: true, fullName:
  true, email: true }` en vez de `include: { owner: true }` — nunca traer `passwordHash` ni
  `ssoProvider` a esta respuesta. **Nota aparte, no de este cambio:** `getById`/`getByAssetTag`
  ya tienen este mismo problema hoy en producción — deuda de seguridad real, ítem propio a futuro,
  no se corrige acá.
- **[Riesgo] Preferencia de columnas en `localStorage`** → no persiste entre navegadores/PCs del
  mismo usuario, ni la ve un admin. Aceptado: es una conveniencia de UI por viewer, no un dato de
  negocio — mismo criterio que otras preferencias de interfaz.

## Migration Plan

1. Backend: agregar `owner: { select: { id: true, fullName: true, email: true } }` al `include`
   de `AssetsService.list()` — nunca `owner: true` a secas.
2. Frontend: definir el set completo de columnas (con grupo y visibilidad por defecto) y el
   estado `columnVisibility` (`Record<string, boolean>`), filtrando `<th>`/`<td>` al renderizar,
   manteniendo el `overflow-x-auto` ya existente.
3. Agregar el badge de origen SIGA (lista + detalle).
4. Selector de columnas (checkbox por columna, agrupado), persistido en `localStorage`.

**Rollback:** revertir el commit — no hay migración de esquema ni dato escrito, es un cambio de
UI + un `include` adicional de solo lectura.
