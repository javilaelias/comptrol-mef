# Intangibles: SIGA frente al Excel del coordinador

El módulo **Intangibles** (menú superior) reúne las licencias y el software patrimonial del MEF.
Combina dos fuentes:

| Fuente | Qué aporta | Cómo llega a Comptrol |
|---|---|---|
| **SIGA** (patrimonio, grupo 14 clase 04) | Los datos base: código patrimonial, descripción, OC, proveedor, fecha de alta, valor inicial, estado (vigente o de baja) | Por script, con cada corte nuevo del dump de SIGA |
| **Excel del coordinador de infraestructura** (hoja "margesi") | Lo que SIGA no tiene: condición de vida útil, fecha de vencimiento, justificación, HR, documento | Subiéndolo desde la pantalla |

Los intangibles **no** aparecen en "Activos" ni cambian los números del Dashboard de equipos.

---

## Las tres pestañas

- **Listado:** todos los bienes, con los datos de SIGA y los del coordinador en la misma fila. Al
  hacer clic en una fila se ven la justificación, el HR, el documento y el proveedor según cada
  fuente.
- **Comparación SIGA vs Excel:** seis vistas con su conteo, explicadas abajo. Cada vista se puede
  exportar a Excel.
- **Versiones y subida:** el historial de cargas de las dos fuentes y el formulario para subir un
  Excel nuevo.

Arriba a la derecha se ven siempre las **fechas de corte** en uso de cada fuente.

## Pestaña "Sin condición: datos SIGA"

Los bienes vigentes que el Excel tiene **sin condición**, con lo que SIGA sabe de ellos, para
completarlos. Se puede filtrar, buscar y exportar (incluye la fila del Excel).

- **Fin de vida útil (SIGA)**: fecha contable (alta + años de vida útil). SIGA no guarda el
  vencimiento de la licencia (`fecha_garantia_fin` viene vacía).
- **Orden verificada**: la orden de SIGA de ese número, del año de compra o el anterior, contiene
  el mismo ítem de catálogo del bien. Se muestran tipo (OC/OS), fecha y objeto.
- **No verificada**: SIGA registra un N° de orden, pero la orden con ese número es de otra cosa
  (ej. `140400030005` → OC 553-2013 es de cableado). Revisar a mano.
- **Sin orden (NEA)**: el bien ingresó por Nota de Entrada de Almacén.
- **Fecha de compra / NEA (SIGA)**: la de la ficha del bien (fecha de compra si ingresó por orden,
  de la NEA si no). No es la fecha de la orden, que solo figura cuando la orden está verificada.
- **Situación**: *No perpetuo* si el fin de vida útil ya pasó, *Vigente* si todavía no llega,
  *Perpetua* si SIGA no tiene fecha.
- **Clic en una fila**: muestra la orden reconstruida desde SIGA (fecha, proveedor y RUC, contrato,
  concepto, ítems y totales). No es el documento firmado: SIGA no lo guarda. Solo en órdenes
  verificadas; en las demás explica por qué no hay orden.

Con los cortes actuales: 932 bienes; 916 con fin de vida útil; 548 verificadas, 35 no
verificadas, 349 por NEA. Los datos se cargan con `import:siga-intangibles`.

## Qué significa cada vista de la comparación

| Vista | Qué muestra | Qué hacer |
|---|---|---|
| **Solo en SIGA** | Bienes que SIGA tiene y el Excel no. Separa los *vigentes* (la señal) de los *de baja* (informativo) | Los vigentes le faltan al coordinador |
| **Solo en Excel** | Códigos del Excel que no existen en SIGA | Revisar el código, o esperar un corte de SIGA más nuevo (ver abajo) |
| **Campos distintos** | Bienes en ambos lados con descripción, código de inventario, OC, fecha de alta o valor distintos | SIGA es la referencia: corregir el Excel |
| **Cantidades por OC** | Bienes vigentes por N° de OC y año de alta, en cada fuente | Las OC con diferencia indican bienes faltantes o sobrantes |
| **Pendientes del coordinador** | Bienes vigentes sin condición, o con vida útil definida sin fecha de vencimiento | **Exportar** y enviárselo al coordinador para que lo complete |
| **Vencimientos** | Bienes con fecha de vencimiento: vencidos, por vencer (90 días) y vigentes | Planificar renovaciones |

**Reglas de la comparación:**
- El cruce es por **código patrimonial**.
- Una OC en `0` en el Excel cuenta igual que una OC vacía en SIGA.
- El **proveedor no se compara**: la razón social se escribe distinto en cada fuente ("S.A.C."
  contra "SOCIEDAD ANONIMA CERRADA") y generaba miles de diferencias falsas. Se muestran los dos
  en el detalle de cada bien.
- El año de la OC es el **año de la fecha de alta**, porque SIGA no guarda el año de la orden.
- La etiqueta **¿Cuenta?** marca los bienes que el Excel registra en la cuenta "MUEBLES Y ENSERES
  NO DEPRECIABLE". Es un posible error de cuenta, porque son intangibles.

### Resultado con los datos actuales (SIGA 15/07/2026 · Excel 30/06/2026)

- Solo en SIGA: 0 vigentes y 134 de baja. Solo en Excel: 0.
- Campos distintos: 1 (el bien 140400040398 tiene OC 1 en el Excel y ninguna en SIGA).
- Pendientes del coordinador: 932 sin condición y 2,241 con vida útil definida sin vencimiento.
- Vencimientos: 2,602 vencidos y 91 vigentes.
- Cuenta dudosa: 2,000 bienes.
- 12 filas del Excel traen la condición escrita en la columna de vencimiento ("Vidal Util
  indefinida"). La subida las reporta como advertencia y quedan sin fecha de vencimiento.

## Subir una nueva versión del Excel

1. Pestaña **Versiones y subida** → elegir el archivo `.xlsx` (máximo 20 MB).
2. Revisar la **fecha de corte**. Se sugiere a partir del nombre: "INTANGIBLES AL 30.06…" →
   30/06 del año en curso.
3. **Subir.** Al terminar se muestra cuántos bienes se cargaron y la lista de advertencias (fila y
   motivo).

**Detalles:**
- Se lee la hoja que tenga las columnas COD PATRIMONIAL, DESCRIPCION DEL BIEN, CONDICION y FECHA DE
  VENCIMIENTO; las demás hojas (por ejemplo, la tabla dinámica) se ignoran. Si faltan columnas, la
  subida se rechaza e indica cuáles.
- La versión nueva queda como **vigente**. Las anteriores **no se borran**: desde el historial,
  "Usar esta versión" vuelve a cualquiera de ellas.
- Se pueden subir varias versiones con la misma fecha de corte ("version 1", "version 2").
- Cada subida queda registrada en la auditoría (quién, archivo y filas).

## Licencias

La pantalla **Licencias** muestra las licencias de software de dos orígenes:

- **Intangibles:** se calculan solas agrupando los bienes vigentes por descripción. Por ejemplo,
  los 19 bienes "LICENCIA DE MICROSOFT PROJECT PROFESIONAL" forman una licencia de 19 asientos.
  - La **próxima renovación** es la fecha de vencimiento más cercana que puso el coordinador.
  - El **estado** es *vigente*, *por vencer* (90 días), *vencida*, o *retirada* si ya no le quedan
    bienes vigentes.
  - El **tipo** es *perpetua* si la mayoría de los bienes tiene vida útil indefinida; si no, es
    *suscripción*.
  - Se recalculan con cada carga de SIGA, cada subida del Excel y cada cambio de versión vigente.
- **Manual:** las cargadas antes desde la "Relación de Licencias y aplicativos" (import:docs). No se
  tocan.

Al hacer clic en una licencia de intangibles se ven sus bienes (código, OC, condición, vencimiento
y valor).

El KPI **"Licencias registradas (total)"** del Dashboard suma los asientos de todas las licencias
no retiradas, e indica cuántos vienen de intangibles.

**Ojo con el doble conteo:** algunas licencias pueden aparecer en los dos orígenes con nombres
distintos (por ejemplo, "MS Project Professional" manual y "LICENCIA DE MICROSOFT PROJECT
PROFESIONAL" de intangibles). Hoy el KPI suma ambas.

## Alertas

La pantalla **Alertas** (con contador en el menú) avisa de las licencias por vencer. Solo avisa
dentro de la app; no envía correos.

- Todos los días a las **07:00** (hora de Lima) se revisan las fechas de renovación. También se
  revisan al subir el Excel, al cambiar la versión vigente y al cargar un corte de SIGA.
- Cada licencia genera **una** alerta cuando cruza un umbral de anticipación (por defecto 90, 60, 30
  y 7 días), y otra si ya venció. Al cruzar un umbral más cercano, la alerta anterior se cierra sola.
- **Atender** o **Descartar** deja registrado quién y cuándo. Esa alerta no vuelve a aparecer.
- Si una nueva versión del Excel cambia la fecha y ya no corresponde avisar, la alerta se cierra
  sola ("Cerradas solas").
- Los administradores (super_admin, it_admin) cambian los umbrales, si se alertan las ya vencidas,
  y pueden desactivar las alertas. Los demás usuarios ven la configuración pero no la cambian.

Con los datos actuales hay 4 alertas: las 4 licencias de intangibles vencidas. Ninguna vence en los
próximos 90 días.

## Cargar un corte nuevo de SIGA

La carga de SIGA se hace por script, porque el dump pesa varios GB:

```bash
SIGA_DATABASE_URL=postgresql://… SIGA_CUT_DATE=2026-07-15 npm run import:siga-intangibles
```

- `SIGA_CUT_DATE` es obligatorio (fecha de corte del dump).
- Repetir un corte que ya existe falla, salvo que se agregue `SIGA_REPLACE=1`.
- No toca la tabla de activos (equipos).
- Al terminar, recalcula las licencias que vienen de intangibles y las alertas.

**¿Cuándo pedir un corte nuevo de SIGA?** Cuando el Excel del coordinador sea más reciente que el
último corte de SIGA. La pantalla lo avisa con un recuadro amarillo, porque en ese caso "Solo en
Excel" puede mostrar bienes que SIGA todavía no refleja.

## Desplegar en el servidor (runbook)

1. Actualizar el código en `/home/usr_admin/apps/Comptrol/`, con el mismo procedimiento de los
   despliegues anteriores (`git archive` + respaldo con fecha de `apps/api` y `apps/web`).
2. **Reinstalar las dependencias de la API antes de reiniciarla.** `node_modules` vive en un
   volumen persistente y solo se instala si falta `nest`, así que las librerías nuevas
   (`exceljs`, `@nestjs/schedule`) no se instalarían solas y la API no compilaría:

   ```bash
   docker compose -f docker-compose.server.yml run --rm api npm ci --include=dev
   docker compose -f docker-compose.server.yml up -d api web
   ```

3. Al arrancar, la API aplica sola las 4 migraciones nuevas (`prisma migrate deploy`). Verificar
   con `docker compose -f docker-compose.server.yml logs api` y con el healthcheck
   `/api/v1/health/ready`.
4. Cargar los intangibles de SIGA por el túnel (puerto 5437):
   `SIGA_CUT_DATE=2026-07-15 npm run import:siga-intangibles`.
5. Subir el Excel del coordinador desde **Intangibles → Versiones y subida** (corte 30/06/2026).
6. Revisar que los conteos coincidan con la sección "Resultado con los datos actuales".

**Reversa:** volver al respaldo de `apps/api` y `apps/web` y reiniciar. Las tablas nuevas no
molestan al código anterior. Para borrarlas del todo, hay que eliminar `intangible_batches`,
`intangible_records`, `alert_rules` y `alerts`, las licencias con `origin='intangibles'` y las
columnas `origin`/`origin_key`. Los valores nuevos de los enums (`perpetual`, `retired`) quedan
sin uso, lo cual es inofensivo.
