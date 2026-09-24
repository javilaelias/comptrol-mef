## ADDED Requirements

### Requirement: Datos SIGA de los bienes sin condición
El sistema SHALL mostrar, en una pestaña propia de Intangibles, los bienes vigentes cuyo registro
en el Excel del coordinador vigente no tiene condición, con: código, descripción, fin de vida útil
según SIGA, tipo de ingreso, N° de orden, tipo de orden (OC/OS), fecha y objeto de la orden,
proveedor y la situación de la orden. SHALL poder exportarse a Excel.

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
