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

## Cargar un corte nuevo de SIGA

La carga de SIGA se hace por script, porque el dump pesa varios GB:

```bash
SIGA_DATABASE_URL=postgresql://… SIGA_CUT_DATE=2026-07-15 npm run import:siga-intangibles
```

- `SIGA_CUT_DATE` es obligatorio (fecha de corte del dump).
- Repetir un corte que ya existe falla, salvo que se agregue `SIGA_REPLACE=1`.
- No toca la tabla de activos (equipos).

**¿Cuándo pedir un corte nuevo de SIGA?** Cuando el Excel del coordinador sea más reciente que el
último corte de SIGA. La pantalla lo avisa con un recuadro amarillo, porque en ese caso "Solo en
Excel" puede mostrar bienes que SIGA todavía no refleja.
