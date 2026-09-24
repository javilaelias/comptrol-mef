# intangibles-coordinator-upload Specification

## Purpose
Permitir que un usuario de Comptrol suba desde la pantalla cada nueva versión del Excel de
intangibles del coordinador de infraestructura, conservando el historial de versiones.

## Requirements

### Requirement: Subida del Excel del coordinador
El sistema SHALL permitir a un usuario autenticado de Comptrol subir un archivo `.xlsx` de hasta
20 MB, indicando su fecha de corte. SHALL leer solo la hoja `margesi al 14` (o la primera hoja
cuyos encabezados coincidan con el formato esperado) e ignorar las demás hojas. Cada subida SHALL
guardarse como una versión nueva con: fecha de corte, nombre del archivo, usuario que la subió,
fecha de subida y cantidad de filas.

#### Scenario: Subida válida
- **WHEN** el usuario sube "INTANGIBLES AL 30.06 (version 1)_22092023.xlsx" con corte 2026-06-30
- **THEN** se crea una versión con 9,986 filas y pasa a ser la versión vigente del coordinador

#### Scenario: Formato incorrecto
- **WHEN** el archivo no tiene ninguna hoja con las columnas obligatorias (COD PATRIMONIAL,
  DESCRIPCION DEL BIEN, CONDICION, FECHA DE VENCIMIENTO)
- **THEN** el sistema rechaza la subida, indica qué columnas faltan y no crea ninguna versión

#### Scenario: Archivo que no es xlsx o supera el tamaño
- **WHEN** el usuario sube un archivo con otra extensión, o de más de 20 MB
- **THEN** el sistema lo rechaza con un mensaje claro

#### Scenario: Archivo desproporcionado
- **WHEN** el archivo tiene más de 50,000 filas o más de 20 hojas
- **THEN** el sistema aborta la lectura, rechaza la subida y no crea ninguna versión

#### Scenario: Filas con problemas
- **WHEN** hay filas sin código patrimonial, con códigos repetidos o con fechas ilegibles
- **THEN** la versión se crea con las filas válidas y el resultado de la subida lista las filas
  descartadas o con advertencias (número de fila y motivo)

### Requirement: Normalización de los datos del coordinador
El sistema SHALL normalizar al cargar: recortar espacios, unificar mayúsculas y tildes en
CONDICIÓN (por ejemplo, "Vida Util Definida " y "VIDA UTIL DEFINIDA" son el mismo valor) y tratar
el N° de OC 0 como vacío. El valor original SHALL conservarse para la trazabilidad.

#### Scenario: Variantes de escritura de la condición
- **WHEN** el Excel trae "Vida Util Indefinida ", "VIDA UTIL INDEFINIDA" y "Vida Util Indefinida"
- **THEN** los tres se cuentan como una sola condición "VIDA ÚTIL INDEFINIDA"

### Requirement: Historial de versiones
El sistema SHALL listar las versiones subidas (corte, archivo, usuario, fecha, filas) y permitir
elegir cuál es la vigente. Ninguna subida SHALL borrar versiones anteriores.

#### Scenario: Volver a una versión anterior
- **WHEN** el usuario marca como vigente una versión anterior
- **THEN** la pantalla de intangibles y la comparación pasan a usar esa versión
