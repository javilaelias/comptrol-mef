## Purpose

Permitir ver cualquier campo de un activo desde la lista (no solo un subconjunto fijo) y
reconocer de un vistazo los activos que provienen de la importación de SIGA.

## Requirements

### Requirement: Selector de columnas visibles
El sistema SHALL ofrecer un control donde el usuario elige, de entre todos los campos
disponibles de un activo, cuáles se muestran como columnas en la lista.

#### Scenario: Activar una columna oculta
- **WHEN** el usuario activa una columna que no estaba visible (ej. "Marca")
- **THEN** la tabla la muestra sin recargar la página ni perder la posición de scroll vertical

#### Scenario: Desactivar una columna visible
- **WHEN** el usuario desactiva una columna que estaba visible
- **THEN** la columna deja de mostrarse inmediatamente

### Requirement: Columnas que exceden el ancho se ven por scroll horizontal
El sistema SHALL mantener todas las columnas activas en una sola tabla que se desplaza
horizontalmente cuando no entran en el ancho visible, en vez de ocultarlas, apilarlas o paginarlas
por columna.

#### Scenario: Muchas columnas activas a la vez
- **WHEN** el usuario activa más columnas de las que entran en el ancho de la pantalla
- **THEN** la tabla permite desplazamiento horizontal para ver las columnas restantes, sin perder
  ninguna columna activa

### Requirement: La preferencia de columnas visibles persiste entre sesiones
El sistema SHALL recordar, para el mismo navegador, qué columnas eligió ver el usuario la última
vez.

#### Scenario: Volver a entrar a la lista de activos
- **WHEN** el usuario cierra y vuelve a abrir la lista de activos en el mismo navegador
- **THEN** ve las mismas columnas que había dejado activas la última vez

### Requirement: Indicador de origen SIGA
El sistema SHALL mostrar, tanto en la lista como en el detalle de un activo, una señal visible
cuando ese activo proviene de la importación del patrimonio de SIGA.

#### Scenario: Activo importado de SIGA
- **WHEN** se muestra un activo cuyo origen es la importación de SIGA
- **THEN** aparece un indicador reconocible (ej. una etiqueta "Importado de SIGA") junto a ese
  activo

#### Scenario: Activo de alta manual o de otro origen
- **WHEN** se muestra un activo que no proviene de la importación de SIGA
- **THEN** no aparece el indicador de origen SIGA
