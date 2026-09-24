# expiry-alerts Specification

## Purpose
Avisar con anticipación, dentro de Comptrol, de los vencimientos de licencias e intangibles, para
reemplazar las alertas que antes daba Vencix.

## Requirements

### Requirement: Reglas de alerta configurables
El sistema SHALL tener umbrales de anticipación configurables (por defecto 90, 60, 30 y 7 días) y
permitir a los administradores de Comptrol (super_admin, it_admin) cambiarlos, activarlos o
desactivarlos. Los demás usuarios SHALL poder verlos pero no
cambiarlos.

#### Scenario: Usuario sin rol de administrador
- **WHEN** un usuario con rol `employee` intenta cambiar los umbrales o forzar la generación
- **THEN** recibe 403 y nada cambia

#### Scenario: Cambiar umbrales
- **WHEN** un administrador deja activos solo los umbrales 30 y 7
- **THEN** las siguientes generaciones solo crean alertas a 30 y 7 días

### Requirement: Generación diaria de alertas
El sistema SHALL revisar una vez al día las licencias con fecha de renovación y crear una alerta
por cada licencia que cruce un umbral o ya haya vencido. SHALL no crear alertas duplicadas para la
misma licencia, umbral y fecha de vencimiento.

#### Scenario: Licencia a 30 días
- **WHEN** una licencia vence en 30 días y el umbral de 30 está activo
- **THEN** se crea una alerta "vence en 30 días" con enlace a la licencia

#### Scenario: Generación ejecutada dos veces el mismo día
- **WHEN** la generación corre dos veces el mismo día
- **THEN** no se duplican las alertas

#### Scenario: Primera ejecución con vencimientos antiguos
- **WHEN** la generación corre por primera vez con 2,602 bienes ya vencidos
- **THEN** las alertas se crean por licencia (una por grupo), no una por bien

### Requirement: Bandeja de alertas
El sistema SHALL mostrar las alertas en una pantalla "Alertas" (abiertas, atendidas y
descartadas), con un contador de abiertas en el menú, visible para cualquier usuario autenticado
de Comptrol. Un usuario SHALL poder marcar una alerta como atendida o descartada, y quedará
registrado quién y cuándo.

#### Scenario: Atender una alerta
- **WHEN** el usuario marca una alerta como atendida
- **THEN** sale de la lista de abiertas, el contador del menú baja y queda registrado quién la
  atendió

#### Scenario: Vencimiento actualizado
- **WHEN** una nueva versión del Excel mueve la fecha de vencimiento a una fecha que ya no cruza
  ningún umbral
- **THEN** la alerta abierta se cierra sola como "resuelta por actualización"
