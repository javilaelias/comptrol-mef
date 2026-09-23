## 1. Backend

- [x] 1.1 Agregar `owner: { select: { id: true, fullName: true, email: true } }` al `include` de
      `AssetsService.list()` (`apps/api/src/modules/assets/assets.service.ts`) — **nunca**
      `owner: true` a secas (filtraría `passwordHash`, exigencia de concilio). **Cerrado:**
      verificado con una consulta Prisma real contra la base local — la respuesta trae
      `owner.id/fullName/email` y NO `passwordHash` en ningún nivel.

## 2. Frontend — definición de columnas (sin dependencia nueva)

- [x] 2.1 Definir el tipo completo de `Asset` en el frontend (todos los campos que ya devuelve
      el backend, no solo los 6 actuales) y un array de definición de columnas (`key`, `label`,
      `group`, `defaultVisible`) agrupadas (Identificación, Ubicación/Responsable, Compra y
      garantía, Hardware, Auditoría) — las 6 actuales + Responsable como `defaultVisible: true`,
      el resto `false`. Sin agregar ninguna dependencia nueva a `package.json`. **Cerrado:**
      `apps/web/src/app/assets/columns.tsx`, 30 columnas en 6 grupos.

## 3. Frontend — tabla y selector de columnas

- [x] 3.1 En `apps/web/src/app/assets/page.tsx`: estado `columnVisibility` como
      `Record<string, boolean>` inicializado desde `defaultVisible`; renderizar `<th>`/`<td>`
      filtrando por ese estado (mismo patrón `useState` ya usado en el archivo). Mantener el
      `overflow-x-auto` ya existente en el contenedor. **Cerrado.**
- [x] 3.2 Agregar el control de selección de columnas (checkbox por columna, agrupado). **Cerrado**
      (dropdown "Columnas (n/30)"). **No verificado en navegador real** (sin acceso a browser
      interactivo desde esta sesión) — solo compilación/tipos, ver 5.2.
- [x] 3.3 Persistir `columnVisibility` en `localStorage` (try/catch, sin romper el render si el
      storage no está disponible) y restaurarlo al cargar la página. **Cerrado:**
      `loadColumnVisibility`/`saveColumnVisibility` en `columns.tsx`, con merge contra el default
      (una columna nueva agregada después no rompe preferencias viejas guardadas).

## 4. Indicador de origen SIGA

- [x] 4.1 Badge "Importado de SIGA" en la lista, condicionado a
      `fingerprint?.startsWith('siga:')` (helper `isSigaImported`, `apps/web/src/lib/
      assetOrigin.ts`) — sin exponer el `fingerprint` crudo en la UI. **Cerrado.**
- [x] 4.2 Mismo badge en `apps/web/src/app/assets/[id]/page.tsx` (agregado `fingerprint` al tipo
      `Asset` de esa página). **Cerrado.**

## 5. Cierre

- [x] 5.1 `npm run build` del workspace `web`: **compiló limpio**, `/assets` y `/assets/[id]`
      generados sin errores nuevos (`tsc --noEmit` también limpio). `flutter analyze` no aplica
      (este repo es Next.js, no Flutter).
- [ ] 5.2 **Pendiente, no cubierto por esta sesión:** verificación visual en navegador real (clic
      en el selector, scroll horizontal, badge visible) — esta sesión no tiene acceso a un
      navegador interactivo. Recomendado: usuario verifica en local (`npm run dev` en `apps/web`
      + `apps/api`) o en staging cuando se despliegue.
- [x] 5.3 Actualizar `ESTADO_PROYECTO.md` con el cierre de este bloque.
- [ ] 5.4 Commit (sin push automático — confirmar con el usuario antes de pushear, mismo criterio
      que el resto de la sesión).
- [ ] 5.5 Archivar el cambio (`openspec archive`) tras QA.
