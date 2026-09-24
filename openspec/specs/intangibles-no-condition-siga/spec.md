# intangibles-no-condition-siga Specification

## Purpose
Mostrar, para los bienes intangibles vigentes que el Excel del coordinador tiene sin condición, lo que
SIGA sabe de ellos (fin de vida útil, fecha de compra o NEA y la orden de compra o servicio), para completarlos.

## Requirements

### Requirement: Datos SIGA de los bienes sin condición
El sistema SHALL mostrar, en una pestaña propia de Intangibles, los bienes vigentes cuyo registro
en el Excel del coordinador vigente no tiene condición, con: código, descripción, fin de vida útil
según SIGA, tipo de ingreso, N° de orden, tipo de orden (OC/OS), fecha y objeto de la orden,
proveedor, la situación de la orden y la fecha de compra o NEA. SHALL poder exportarse a Excel.

#### Scenario: Orden verificada
- **WHEN** la orden de `sig_patrimonio.nro_orden` existe en SIGA en el año de compra (o el anterior) y contiene el mismo ítem de catálogo del bien
- **THEN** se muestra tipo, fecha y objeto de la orden y la situación "Verificada"

#### Scenario: Orden no verificada
- **WHEN** el bien tiene N° de orden pero la orden de ese número no contiene su ítem de catálogo (ej. `140400030005`, OC 553)
- **THEN** se muestra el N° de SIGA con la situación "No verificada" y sin fecha ni objeto

#### Scenario: Ingreso sin orden
- **WHEN** el bien ingresó por Nota de Entrada de Almacén (N° de orden 0)
- **THEN** la situación es "Sin orden (ingreso por NEA)"

#### Scenario: Fecha de vencimiento
- **WHEN** SIGA tiene `fec_fin_vida`
- **THEN** se muestra rotulada "Fin de vida útil (SIGA)", distinta de la fecha de vencimiento del Excel

### Requirement: Situación según el fin de vida útil
La columna "Situación" SHALL mostrar "No perpetuo" si el fin de vida útil de SIGA ya pasó,
"Perpetua" si SIGA no tiene fecha y "Vigente" si la fecha es futura. La situación de la orden SHALL
mostrarse en una columna aparte. Ambas SHALL poder filtrarse a la vez.

#### Scenario: Bien vencido
- **WHEN** el bien `140400030005` tiene fin de vida útil 26/12/2017
- **THEN** su Situación es "No perpetuo" y su Orden "No verificada"

### Requirement: Ver la orden al hacer clic
Al hacer clic en un bien, el sistema SHALL mostrar su orden reconstruida desde SIGA (cabecera,
proveedor y RUC, contrato, concepto, ítems con cantidad, unidad y precios, subtotal, IGV y total),
rotulada como no firmada. En órdenes no verificadas o ingresos por NEA SHALL explicar por qué no hay
orden.

#### Scenario: Orden verificada
- **WHEN** se hace clic en `140400030144`
- **THEN** se muestra la OC 1-2014 con 1 ítem y total S/ 84,096.44

#### Scenario: Orden no verificada
- **WHEN** se hace clic en `140400030005`
- **THEN** se explica que la orden N° 553 de SIGA es de otra cosa y se muestra la fecha de compra de la ficha

### Requirement: Fecha de compra o NEA
El sistema SHALL mostrar la fecha de la ficha del bien en SIGA: fecha de compra si ingresó por orden,
fecha de la NEA si no, distinta de la fecha de la orden.

#### Scenario: Todos los bienes con fecha
- **WHEN** se listan los bienes sin condición del corte 15/07/2026
- **THEN** los 932 tienen fecha de compra o NEA; `140400030005` muestra 26/12/2013

