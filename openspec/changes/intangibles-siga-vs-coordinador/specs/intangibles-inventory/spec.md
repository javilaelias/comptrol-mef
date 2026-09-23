## Purpose

Tener en Comptrol el patrimonio de bienes intangibles de SIGA (licencias y software), separado del
inventario de equipos, versionado por fecha de corte y consultable desde su propia pantalla.

## ADDED Requirements

### Requirement: Carga versionada de intangibles desde SIGA
El sistema SHALL cargar desde la base de SIGA todos los bienes intangibles del MEF (grupo 14,
clase 04, unidad ejecutora 46), incluidos los dados de baja, como una versión nueva con la fecha de
corte de SIGA indicada por el operador. Por cada bien SHALL guardar: código patrimonial, código de
inventario, descripción, marca, modelo, estado (vigente o baja), N° de OC, año de la OC, proveedor
(nombre), N° de contrato, fecha de alta, valor inicial, dependencia y ubicación física.

#### Scenario: Carga completa del corte 15/07/2026
- **WHEN** el operador ejecuta la carga contra `siga15072026` con corte 2026-07-15
- **THEN** se crea una versión de origen SIGA con 10,120 bienes (9,986 vigentes y 134 de baja)

#### Scenario: Re-ejecutar la carga con el mismo corte
- **WHEN** el operador vuelve a ejecutar la carga con una fecha de corte que ya existe
- **THEN** el sistema rechaza la carga y no crea una versión duplicada, salvo que el operador
  pida reemplazarla explícitamente

#### Scenario: La carga no toca los equipos
- **WHEN** termina la carga de intangibles
- **THEN** la tabla de activos (equipos) y sus conteos quedan exactamente iguales

#### Scenario: OC vacía
- **WHEN** un bien de SIGA no tiene N° de OC o lo tiene en 0
- **THEN** se guarda como vacío (sin OC), no como 0

### Requirement: Pantalla de intangibles
El sistema SHALL ofrecer una pantalla "Intangibles", accesible para cualquier usuario autenticado
de Comptrol, que liste los bienes de la versión SIGA vigente con búsqueda por texto (código,
descripción, proveedor, OC), filtros por estado, condición y vencimiento, y paginación. Cada fila
SHALL combinar los datos base de SIGA con los datos del coordinador (condición, vencimiento,
justificación, HR, documento) de la versión vigente del Excel, si existe.

#### Scenario: Buscar por código patrimonial
- **WHEN** el usuario busca `140400030001`
- **THEN** ve ese bien con sus datos de SIGA y la condición y el vencimiento que puso el
  coordinador

#### Scenario: Bien sin datos del coordinador
- **WHEN** un bien existe en SIGA pero no en el Excel vigente
- **THEN** la fila se muestra con los campos del coordinador vacíos y marcada "sin datos del
  coordinador"

#### Scenario: Las fechas de corte están siempre a la vista
- **WHEN** el usuario abre la pantalla
- **THEN** ve la fecha de corte de la versión SIGA y la de la versión del coordinador que se
  están usando
