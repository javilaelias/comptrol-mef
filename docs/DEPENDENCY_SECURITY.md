# Dependency security (`npm audit`)

Este repositorio usa Node.js + npm y contiene múltiples `package-lock.json` (raíz y apps). Para evaluar vulnerabilidades de forma práctica:

## API (NestJS)

Auditar el árbol de dependencias de la API (como se instala en Docker, sin workspaces):

```bash
cd apps/api
npm audit --workspaces=false
```

Notas:
- Se usan `overrides` en `apps/api/package.json` para forzar parches de dependencias transitivas (p. ej. Hono/Lodash) cuando el upstream aún no actualiza.
- Existe al menos 1 hallazgo **high** asociado a `xlsx` sin fix automático en npm. En este proyecto se usa para **importación offline** desde `apps/importer` (no como endpoint público).

Mitigación recomendada para `xlsx`:
- No aceptar archivos Excel de usuarios externos por HTTP.
- Mantener importaciones como tarea de administración (operador autorizado) y ejecutar en un entorno aislado (job/container separado) si va a producción.
- Considerar reemplazar `xlsx` por otra librería o flujo de conversión si se requiere eliminar el hallazgo.

## Raíz / Workspaces

Si ejecutas `npm audit` en la raíz, puede reportar un superset de hallazgos por el modo workspace y dependencias de tooling.

