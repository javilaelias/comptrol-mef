# licenses-from-intangibles Specification

## Purpose
Alimentar el módulo de Licencias de Comptrol a partir de los intangibles, agrupando los bienes de
una misma licencia, y ofrecer una pantalla para consultarlas.

## Requirements

### Requirement: Agrupación de intangibles en licencias
El sistema SHALL generar una licencia por cada descripción normalizada de intangible (mayúsculas,
sin tildes ni espacios duplicados), con: nombre (la descripción), fabricante (la marca más
frecuente), asientos totales (la cantidad de bienes vigentes del grupo), próxima renovación (la
fecha de vencimiento futura más cercana del grupo, si hay) y estado derivado (vigente, por vencer,
vencida o sin vencimiento). La generación SHALL correr después de cada carga de SIGA o subida del
Excel, y SHALL ser idempotente: re-ejecutarla actualiza las mismas licencias sin duplicarlas.

#### Scenario: Microsoft Project
- **WHEN** hay 19 bienes vigentes "LICENCIA DE MICROSOFT PROJECT PROFESIONAL"
- **THEN** existe una licencia con ese nombre y 19 asientos

#### Scenario: Re-ejecución
- **WHEN** se regeneran las licencias dos veces seguidas sin cambios en los datos
- **THEN** la cantidad de licencias y sus valores quedan iguales

### Requirement: Las licencias de otro origen no se tocan
El sistema SHALL marcar las licencias generadas desde intangibles con su origen, y la
regeneración SHALL crear, actualizar o retirar solo esas licencias.

#### Scenario: Licencia cargada desde documentos
- **WHEN** existe una licencia cargada por el importador de documentos
- **THEN** la regeneración desde intangibles no la modifica ni la borra

#### Scenario: Grupo que desaparece
- **WHEN** todos los bienes de un grupo pasan a baja en SIGA
- **THEN** la licencia de ese grupo queda con estado "retirada" (no se borra)

### Requirement: KPI de licencias del Dashboard
El KPI "Licencias registradas (total)" del Dashboard SHALL sumar los asientos de las licencias no
retiradas de cualquier origen, y SHALL mostrar cuántos de esos asientos vienen de intangibles.

#### Scenario: Después de generar desde intangibles
- **WHEN** se generan las licencias desde intangibles con 9,986 bienes vigentes
- **THEN** el KPI suma también esos asientos y la tarjeta indica "de ellas, 9,986 desde
  intangibles"

#### Scenario: Licencias retiradas
- **WHEN** una licencia generada desde intangibles queda retirada
- **THEN** sus asientos dejan de sumar en el KPI

### Requirement: Pantalla de licencias
El sistema SHALL ofrecer una pantalla "Licencias" con la lista de licencias (nombre, fabricante,
asientos, próxima renovación, estado, origen), búsqueda, filtro por estado y, desde cada
licencia, acceso a los intangibles que la componen.

#### Scenario: Ver los bienes de una licencia
- **WHEN** el usuario abre una licencia generada desde intangibles
- **THEN** ve la lista de sus bienes con código patrimonial, OC y vencimiento
