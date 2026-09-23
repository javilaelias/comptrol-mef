## Purpose

Comparar, por código patrimonial, lo que registra SIGA contra lo que mantiene el coordinador de
infraestructura, para detectar diferencias, pendientes de completar y vencimientos, y exportarlos.

## ADDED Requirements

### Requirement: Cruce por código patrimonial
El sistema SHALL comparar la versión SIGA vigente contra la versión del coordinador vigente usando
el código patrimonial como clave, y SHALL presentar el resultado en estas vistas, cada una con su
conteo: Solo en SIGA (separado en vigentes y bajas), Solo en Excel, Campos distintos, Cantidades por OC, Pendientes del
coordinador y Vencimientos.

#### Scenario: Corte actual
- **WHEN** se comparan SIGA 15/07/2026 y el Excel 30/06/2026
- **THEN** "Solo en Excel" muestra 0, "Solo en SIGA" muestra 0 vigentes y 134 bajas y
  "Campos distintos" no reporta diferencias de OC por 0 contra vacío

### Requirement: Campos distintos con precedencia definida
El sistema SHALL comparar: descripción, código de inventario, N° de OC, fecha de alta y valor
inicial (tolerancia de 0.01). Cada diferencia SHALL mostrar el valor de SIGA y el del Excel. El
proveedor NO SHALL compararse, porque la razón social se escribe distinto en cada fuente; se
muestra lado a lado en el detalle, como dato informativo. Para estos datos base SIGA es la referencia. Condición, fecha de
vencimiento, justificación, HR y documento solo existen en el Excel y no se comparan.

#### Scenario: Proveedor escrito distinto
- **WHEN** el Excel dice "ST COMPUTACION S.A.C." y SIGA "ST COMPUTACION SOCIEDAD ANONIMA CERRADA"
- **THEN** el bien no aparece en "Campos distintos" por ese motivo

#### Scenario: Valor distinto
- **WHEN** un bien tiene valor inicial 58,005.50 en SIGA y 58,000.00 en el Excel
- **THEN** aparece en "Campos distintos" con el campo "valor inicial" y ambos valores

### Requirement: Cantidades por OC
El sistema SHALL agrupar por N° de OC + año de la OC y mostrar la cantidad de bienes en SIGA, la
cantidad en el Excel y la diferencia, destacando las OC con diferencia distinta de cero.

#### Scenario: OC con faltantes
- **WHEN** una OC tiene 10 bienes en SIGA y 8 en el Excel
- **THEN** la fila muestra 10 / 8 / -2 destacada

### Requirement: Pendientes del coordinador
El sistema SHALL listar los bienes vigentes que el coordinador aún no completó: sin condición, y
con vida útil definida pero sin fecha de vencimiento.

#### Scenario: Corte actual
- **WHEN** se abre la vista con el Excel 30/06/2026
- **THEN** muestra 932 sin condición y 2,241 con vida útil definida sin vencimiento

### Requirement: Vista de vencimientos
El sistema SHALL listar los bienes con fecha de vencimiento, separados en vencidos, por vencer
(dentro del umbral de alerta más amplio activo) y vigentes.

#### Scenario: Vencidos al 23/09/2026
- **WHEN** se abre la vista el 23/09/2026 con el Excel 30/06/2026
- **THEN** muestra 2,602 vencidos, y 91 entre por vencer y vigentes

### Requirement: Marca de cuenta contable sospechosa
El sistema SHALL marcar de forma visible, en todas las vistas y en la exportación, los bienes cuya
cuenta contable en el Excel es "MUEBLES Y ENSERES NO DEPRECIABLE", con el texto "Posible error de
cuenta: intangible registrado como mueble no depreciable", y SHALL ofrecer un filtro para verlos
juntos.

#### Scenario: Filtrar la marca
- **WHEN** el usuario filtra por la marca de cuenta sospechosa con el Excel 30/06/2026
- **THEN** ve las 2,000 filas con esa cuenta contable

### Requirement: Aviso de cortes desfasados
El sistema SHALL mostrar un aviso cuando la fecha de corte del Excel vigente sea posterior a la de
la versión SIGA vigente, explicando que "Solo en Excel" puede incluir bienes que SIGA todavía no
refleja y que conviene cargar un corte de SIGA más reciente.

#### Scenario: Excel más nuevo que SIGA
- **WHEN** el Excel vigente tiene corte 30/09/2026 y SIGA 15/07/2026
- **THEN** la comparación muestra el aviso arriba de todas las vistas

### Requirement: Exportación a Excel
El sistema SHALL exportar a `.xlsx` cualquiera de las vistas con los filtros aplicados, incluyendo
una cabecera con las fechas de corte de ambas fuentes y la fecha de generación. Ninguna celda
exportada SHALL ser una fórmula ejecutable.

#### Scenario: Texto que parece fórmula
- **WHEN** una descripción empieza con "=" o "+"
- **THEN** se exporta como texto y no se ejecuta al abrir el archivo en Excel

#### Scenario: Exportar pendientes para el coordinador
- **WHEN** el usuario exporta la vista "Pendientes del coordinador"
- **THEN** descarga un xlsx con una fila por bien pendiente, el motivo y las columnas del Excel
  original, para que el coordinador lo complete
