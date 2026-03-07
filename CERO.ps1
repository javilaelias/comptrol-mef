<#
Comptrol‑MEF — CERO.ps1
======================

Propósito
---------
Script “cero” para:
1) Preparar entorno local (Node/.NET/PostgreSQL).
2) Activar base de datos y aplicar migraciones.
3) Cargar data (seed + import de /docs).
4) Compilar y desplegar el Agente EXE (heartbeat) y (opcional) registrar tarea programada.
5) Iniciar el proyecto (API + Web) para continuar la implementación.

Importante (seguridad)
----------------------
- No versionamos por defecto los Excel/PDF reales en /docs (ver .gitignore y docs/README.md).
- Este script NO imprime contraseñas por pantalla (a menos que tú las pongas literal).

“MCP servers” y “Agentes”
-------------------------
En este repo hay 2 conceptos:

A) Agentes del sistema (Comptrol)
   - Agente EXE (Windows) que envía “heartbeat” al API:
       POST /api/v1/agent/heartbeat (header x-agent-key)
       Código: apps/agent-exe/Comptrol.Agent/Program.cs
       Build:  apps/agent-exe/build.ps1
   - Importadores (operación inicial):
       npm run import:docs
       npm run import:enad

B) MCP (Model Context Protocol) para productividad con IA
   - Para “activar MCP” hay que saber qué cliente usarás (Cursor / Claude Desktop / VS Code / otro).
   - Este script deja recomendaciones y puntos de integración, pero NO puede “conectar” tu cliente sin esa decisión.

Recomendación MCP (alta productividad)
--------------------------------------
- Filesystem: lectura/escritura del repo
- Git: historial/blame/diffs
- PostgreSQL: consultas controladas a la BD comptrol
- Playwright: pruebas/automatización UI
- OpenAPI/HTTP: probar endpoints

Siguientes 10 pasos (roadmap MEF ITAM)
--------------------------------------
1) Catálogo de sedes/ubicaciones con coordenadas oficiales (lat/lon) y mapa 100% exacto.
2) Modelo “ciclo de vida” del activo (alta → asignación → mantenimiento → baja → e‑waste) + evidencias.
3) SAM real: licencias (contratos), asignaciones por equipo/usuario, vencimientos, compliance.
4) Inventario automático: agente EXE como servicio (msi) + hardening + rotación de claves.
5) Descubrimiento agentless por sede (scanner) + conciliación (dedupe serial/MAC/assetTag).
6) RBAC formal MEF (roles, permisos, auditoría por módulo, segregación de funciones).
7) Reportes operativos/tácticos/gerenciales con filtros (sede, unidad, familia, año, estado).
8) Integración con SSO (LDAP/AD o SAML/OIDC) y MFA.
9) Data quality: reglas de validación + panel de “inconsistencias”.
10) Despliegue institucional: Apache reverse proxy + VM + backup + monitoreo + hardening.

#>

[CmdletBinding()]
param(
  [string]$PostgresHost = "localhost",
  [int]$PostgresPort = 5432,
  [string]$PostgresUser = "postgres",
  [string]$PostgresPassword = "",
  [string]$DatabaseName = "comptrol",

  [string]$ApiPort = "3001",
  [string]$WebPort = "3000",

  # Si está en 1, borra e importa nuevamente (solo del tenant MEF) usando IMPORT_RESET=1
  [switch]$ResetImports,

  # Compila el agente EXE y lo copia a esta ruta
  [switch]$BuildAgentExe,
  [string]$AgentInstallDir = "C:\\Comptrol",
  [string]$AgentApiKey = "",
  [string]$AgentAssetTag = "",

  # Crea tarea programada (requiere $BuildAgentExe y $AgentAssetTag)
  [switch]$InstallScheduledTask,
  [int]$TaskMinutes = 15,

  # Inicia API+WEB al final
  [switch]$StartDev
)

$ErrorActionPreference = "Stop"

function Write-Section([string]$Title) {
  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor White -BackgroundColor DarkRed
}

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Falta comando requerido: $Name"
  }
}

function Ensure-ApiEnvFile([string]$DbUrl, [string]$AgentKey) {
  $envPath = Join-Path $PSScriptRoot "apps\\api\\.env"
  if (Test-Path $envPath) {
    Write-Host "OK: existe apps/api/.env (no se sobreescribe)"
    return
  }

  @"
DATABASE_URL="$DbUrl"
JWT_SECRET="change-me-in-prod"
AGENT_API_KEY="$AgentKey"
"@ | Set-Content -Encoding UTF8 $envPath

  Write-Host "OK: creado apps/api/.env"
}

function Try-Create-DatabaseIfMissing([string]$DbName) {
  # Requiere psql en PATH.
  if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Host "WARN: psql no está en PATH; no puedo crear la BD automáticamente. Crea la BD '$DbName' manualmente si no existe."
    return
  }

  $env:PGPASSWORD = $PostgresPassword
  try {
    $exists = psql -h $PostgresHost -p $PostgresPort -U $PostgresUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName';"
    if ($exists -match "1") {
      Write-Host "OK: BD '$DbName' existe"
      return
    }
    Write-Host "Creando BD '$DbName'..."
    psql -h $PostgresHost -p $PostgresPort -U $PostgresUser -d postgres -c "CREATE DATABASE $DbName;"
    Write-Host "OK: BD '$DbName' creada"
  } finally {
    $env:PGPASSWORD = $null
  }
}

Write-Section "Prerequisitos"
Assert-Command "node"
Assert-Command "npm"
Assert-Command "dotnet"

Write-Host ("node: " + (node -v))
Write-Host ("npm:  " + (npm -v))
Write-Host ("dotnet: " + (dotnet --version))

Write-Section "Base de datos"
$PostgresPassword = if ([string]::IsNullOrWhiteSpace($PostgresPassword)) { Read-Host -Prompt "PostgreSQL password para '$PostgresUser'" } else { $PostgresPassword }
$AgentApiKey = if ([string]::IsNullOrWhiteSpace($AgentApiKey)) { Read-Host -Prompt "AGENT_API_KEY (para endpoint /agent/heartbeat)" } else { $AgentApiKey }

$dbUrl = "postgresql://$PostgresUser:$PostgresPassword@$PostgresHost`:$PostgresPort/$DatabaseName?schema=public"
Ensure-ApiEnvFile -DbUrl $dbUrl -AgentKey $AgentApiKey
Try-Create-DatabaseIfMissing -DbName $DatabaseName

Write-Section "Dependencias + migraciones"
npm install

Push-Location $PSScriptRoot
try {
  npm run migrate
  npm run seed

  if ($ResetImports) {
    Write-Host "IMPORT_RESET=1: reimportando docs + ENAD..."
    $env:IMPORT_RESET = "1"
    npm run import:docs
    npm run import:enad
    $env:IMPORT_RESET = $null
  } else {
    Write-Host "INFO: imports omitidos (usa -ResetImports si deseas recargar /docs)"
  }
} finally {
  Pop-Location
}

Write-Section "Agente EXE (opcional)"
if ($BuildAgentExe) {
  $buildScript = Join-Path $PSScriptRoot "apps\\agent-exe\\build.ps1"
  & $buildScript | Out-Host

  $exeSource = Join-Path $PSScriptRoot "apps\\agent-exe\\out\\Comptrol.Agent.exe"
  if (!(Test-Path $exeSource)) {
    throw "No se encontró el EXE compilado en: $exeSource"
  }

  if (!(Test-Path $AgentInstallDir)) { New-Item -ItemType Directory -Path $AgentInstallDir | Out-Null }
  $exeTarget = Join-Path $AgentInstallDir "Comptrol.Agent.exe"
  Copy-Item -Force $exeSource $exeTarget
  Write-Host "OK: EXE copiado a $exeTarget"

  if ($InstallScheduledTask) {
    if ([string]::IsNullOrWhiteSpace($AgentAssetTag)) {
      throw "Falta -AgentAssetTag (asset tag/código patrimonial) para registrar la tarea programada."
    }
    $taskScript = Join-Path $PSScriptRoot "apps\\agent-exe\\windows\\install-schtask.ps1"
    & $taskScript `
      -ExePath $exeTarget `
      -ApiBaseUrl ("http://localhost:$ApiPort/api/v1") `
      -AgentKey $AgentApiKey `
      -AssetTag $AgentAssetTag `
      -TaskName "ComptrolAgentHeartbeat" `
      -Minutes $TaskMinutes | Out-Host
  }
} else {
  Write-Host "INFO: agente EXE no compilado (usa -BuildAgentExe para generarlo)"
}

Write-Section "MCP (pendiente de decisión)"
Write-Host "Para activar MCP necesito saber qué cliente usarás (Cursor / Claude Desktop / VS Code / otro)."
Write-Host "Recomendados: filesystem, git, postgres, playwright, http/openapi."

Write-Section "Iniciar proyecto (opcional)"
if ($StartDev) {
  Write-Host "Iniciando API+WEB con npm run dev ..."
  npm run dev
} else {
  Write-Host "OK. Para iniciar: npm run dev"
  Write-Host "Web: http://localhost:$WebPort"
  Write-Host "API: http://localhost:$ApiPort/api/v1"
  Write-Host "ENAD: http://localhost:$WebPort/enad"
  Write-Host "Sedes (mapa): http://localhost:$WebPort/sites"
}
