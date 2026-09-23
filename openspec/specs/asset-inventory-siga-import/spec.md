# asset-inventory-siga-import Specification

## Purpose
Mantener el inventario de activos de Comptrol-MEF sincronizado con el patrimonio real registrado
en SIGA, de forma repetible y segura de re-correr, sin arriesgar los datos reales de producción
al escribir.

## Requirements

### Requirement: Verificación previa a toda escritura contra una base de producción
El sistema SHALL soportar una corrida de simulación (dry-run) que muestre el resumen de lo que se
crearía/actualizaría sin escribir nada, y esa corrida SHALL ejecutarse contra el destino real
antes de cualquier corrida que sí escriba.

#### Scenario: Dry-run contra staging antes de la corrida real
- **WHEN** se ejecuta el import con la variable de simulación activada, apuntando a la base de
  producción de Comptrol-MEF
- **THEN** el sistema reporta conteos (activos a crear/actualizar, responsables, sedes,
  ubicaciones) sin modificar ninguna fila

#### Scenario: La corrida real requiere que el dry-run se haya revisado
- **WHEN** el resumen del dry-run difiere significativamente de lo ya documentado para el mismo
  origen de datos
- **THEN** la corrida real (de escritura) no se ejecuta hasta que la diferencia se entienda

### Requirement: Los activos importados se identifican por código patrimonial único
El sistema SHALL usar el código patrimonial de SIGA como identificador único del activo
(`assetTag`), de modo que volver a correr el import actualice los activos ya existentes en vez de
duplicarlos.

#### Scenario: Re-ejecutar el import no duplica activos
- **WHEN** el import se corre una segunda vez sobre el mismo origen de datos, sin cambios
- **THEN** ningún activo nuevo se crea — los existentes se actualizan en el lugar

### Requirement: El acceso a la base de producción durante el import no expone el dato fuente
El sistema SHALL escribir hacia la base de datos real sin requerir que el volumen completo de
datos fuente (el dump de SIGA) se transfiera o resida en el servidor de producción.

#### Scenario: El import corre sin copiar el dump de SIGA al servidor
- **WHEN** se ejecuta el import contra la base de producción
- **THEN** solo las filas resultantes (activos, responsables, sedes, ubicaciones) cruzan hacia el
  servidor — el origen de datos completo permanece donde ya estaba

### Requirement: El import identifica los activos que provienen de SIGA
Cada activo creado o actualizado por este import SHALL quedar marcado de forma que se pueda
distinguir de activos cargados por otras vías (carga manual, otro origen).

#### Scenario: Un activo importado de SIGA es identificable después
- **WHEN** se consulta un activo que fue creado por este import
- **THEN** su origen queda registrado como proveniente de la importación de SIGA, distinguible de
  un alta manual
