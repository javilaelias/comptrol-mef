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
En este repo hay 3 conceptos:

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

C) “Agentes” de productividad (Codex / IA)
   - En Codex CLI los “agentes” prácticos suelen ser Skills instalables (por ejemplo: PDF, Spreadsheet, Playwright, Slides).
   - Este script puede instalar Skills curados de `openai/skills` para acelerar análisis de PDFs/Excel, pruebas UI, y preparar la presentación.
   - Nota: luego de instalar Skills hay que reiniciar Codex para que aparezcan.

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
  # Recomendado: ProgramData para que SYSTEM lo pueda leer siempre.
  [string]$AgentInstallDir = "C:\\ProgramData\\Comptrol\\Agent",
  [string]$AgentApiKey = "",
  [string]$AgentAssetTag = "",

  # Copia el EXE también a apps/web/public/agent para descargarlo desde la web local
  [switch]$PublishAgentToWeb,

  # Crea tarea programada (requiere $BuildAgentExe y $AgentAssetTag)
  [switch]$InstallScheduledTask,
  [int]$TaskMinutes = 15,

  # Inicia API+WEB al final
  [switch]$StartDev,

  # Skills/Agentes para Codex CLI (productividad)
  [bool]$SetupCodexSkills = $true,
  [string[]]$CodexSkills = @("pdf", "spreadsheet", "playwright", "slides", "doc", "security-best-practices"),

  # MCP (Model Context Protocol) - productividad con IA
  [bool]$SetupMcp = $true,
  [switch]$StartMcpInspector,
  [string]$McpWorkspaceRoot = "",
  [string]$GithubToken = ""
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

function Ensure-Dir([string]$Path) {
  if (!(Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
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

function Setup-CodexSkills([string[]]$Skills) {
  Write-Section "Codex Skills (Agentes IA)"

  if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "WARN: python no está instalado/en PATH; no puedo instalar skills automáticamente."
    Write-Host "INFO: Puedes instalar manualmente desde openai/skills cuando tengas python."
    return
  }

  $codexHome = if (-not [string]::IsNullOrWhiteSpace($env:CODEX_HOME)) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
  $installer = Join-Path $codexHome "skills\\.system\\skill-installer\\scripts\\install-skill-from-github.py"

  if (-not (Test-Path $installer)) {
    Write-Host "WARN: No encontré el instalador de skills en: $installer"
    Write-Host "INFO: Si tu Codex está en otra ruta, define CODEX_HOME y reintenta."
    return
  }

  $paths = $Skills | ForEach-Object { "skills/.curated/$($_)" }
  Write-Host ("Instalando skills curados: " + ($Skills -join ", "))

  try {
    python $installer --repo openai/skills --path @($paths) | Out-Host
    Write-Host "OK: skills instalados. Reinicia Codex CLI para que aparezcan."
  } catch {
    Write-Host "WARN: no se pudo instalar skills automáticamente. Detalle: $($_.Exception.Message)"
  }
}

function Write-JsonFile([string]$Path, $Obj) {
  $json = $Obj | ConvertTo-Json -Depth 20
  $dir = Split-Path -Parent $Path
  Ensure-Dir $dir
  $json | Set-Content -Encoding UTF8 $Path
}

function Merge-McpServersJson([string]$Path, $ServersObj) {
  $existing = $null
  if (Test-Path $Path) {
    try { $existing = Get-Content $Path -Raw | ConvertFrom-Json } catch { $existing = $null }
  }

  if ($null -eq $existing) {
    $existing = [pscustomobject]@{ mcpServers = [pscustomobject]@{} }
  }
  if ($null -eq $existing.mcpServers) {
    $existing | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{}) -Force
  }

  foreach ($p in $ServersObj.PSObject.Properties) {
    $existing.mcpServers | Add-Member -NotePropertyName $p.Name -NotePropertyValue $p.Value -Force
  }

  Write-JsonFile -Path $Path -Obj $existing
}

function Setup-Mcp([string]$WorkspaceRoot, [string]$DbUrlForMcp, [string]$GithubPat) {
  Write-Section "MCP (Model Context Protocol)"
  Write-Host "INFO: MCP aumenta productividad integrando herramientas (repo/DB/UI tests) a clientes con soporte MCP."
  Write-Host "INFO: Por seguridad, usa solo servidores oficiales y evita servidores desconocidos."

  # Instalación (global) para que cualquier cliente (Claude/Cursor/VS Code) pueda invocarlos con npx.
  Write-Host "Instalando paquetes MCP (npm global)..."
  npm i -g @modelcontextprotocol/inspector @modelcontextprotocol/server-filesystem @modelcontextprotocol/server-sequential-thinking @modelcontextprotocol/server-github @modelcontextprotocol/server-postgres @playwright/mcp | Out-Host

  # Wrappers para Windows (evitan problemas típicos de npx/caminos con espacios).
  $mcpBin = Join-Path $PSScriptRoot "mcp\\bin"
  Ensure-Dir $mcpBin

  @"
@echo off
npx -y @modelcontextprotocol/server-filesystem %*
"@ | Set-Content -Encoding ASCII (Join-Path $mcpBin "mcp-filesystem.cmd")

  @"
@echo off
npx -y @modelcontextprotocol/server-postgres %*
"@ | Set-Content -Encoding ASCII (Join-Path $mcpBin "mcp-postgres.cmd")

  @"
@echo off
npx -y @modelcontextprotocol/server-sequential-thinking %*
"@ | Set-Content -Encoding ASCII (Join-Path $mcpBin "mcp-sequential-thinking.cmd")

  @"
@echo off
npx -y @modelcontextprotocol/server-github %*
"@ | Set-Content -Encoding ASCII (Join-Path $mcpBin "mcp-github.cmd")

  @"
@echo off
npx -y @playwright/mcp@latest %*
"@ | Set-Content -Encoding ASCII (Join-Path $mcpBin "mcp-playwright.cmd")

  $fsCmd = (Join-Path $mcpBin "mcp-filesystem.cmd")
  $pgCmd = (Join-Path $mcpBin "mcp-postgres.cmd")
  $stCmd = (Join-Path $mcpBin "mcp-sequential-thinking.cmd")
  $ghCmd = (Join-Path $mcpBin "mcp-github.cmd")
  $pwCmd = (Join-Path $mcpBin "mcp-playwright.cmd")

  # Config común (formato Claude Desktop / VS Code / otros que usan mcpServers)
  $servers = [pscustomobject]@{
    "comptrol-filesystem" = @{
      command = $fsCmd
      args    = @($WorkspaceRoot)
    }
    "comptrol-postgres" = @{
      command = $pgCmd
      args    = @($DbUrlForMcp)
    }
    "comptrol-sequential-thinking" = @{
      command = $stCmd
      args    = @()
    }
    "comptrol-playwright" = @{
      command = $pwCmd
      args    = @()
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($GithubPat)) {
    $servers | Add-Member -NotePropertyName "comptrol-github" -NotePropertyValue @{
      command = $ghCmd
      args    = @()
      env     = @{ GITHUB_PERSONAL_ACCESS_TOKEN = $GithubPat }
    } -Force
  } else {
    Write-Host "INFO: GitHub MCP no configurado (no se ingresó token). Puedes re-ejecutar CERO.ps1 con -GithubToken o editar configs."
  }

  # 1) VS Code (local): .vscode/mcp.json (este archivo se genera local; NO se debe commitear)
  $vscodeMcp = Join-Path $PSScriptRoot ".vscode\\mcp.json"
  Write-JsonFile -Path $vscodeMcp -Obj ([pscustomobject]@{ mcpServers = $servers })
  Write-Host "OK: generado $vscodeMcp"

  # 2) Cursor (local): .cursor/mcp.json (este archivo se genera local; NO se debe commitear)
  $cursorMcp = Join-Path $PSScriptRoot ".cursor\\mcp.json"
  Write-JsonFile -Path $cursorMcp -Obj ([pscustomobject]@{ mcpServers = $servers })
  Write-Host "OK: generado $cursorMcp"

  # 3) Claude Desktop: %APPDATA%\\Claude\\claude_desktop_config.json (merge)
  $appData = [Environment]::GetFolderPath("ApplicationData")
  $claudeCfg = Join-Path $appData "Claude\\claude_desktop_config.json"
  Merge-McpServersJson -Path $claudeCfg -ServersObj $servers
  Write-Host "OK: actualizado $claudeCfg (merge de mcpServers)"

  if ($StartMcpInspector) {
    Write-Host "Iniciando MCP Inspector (se abre en navegador)..."
    Start-Process -FilePath "npx" -ArgumentList @("@modelcontextprotocol/inspector") -WorkingDirectory $WorkspaceRoot | Out-Null
    Write-Host "OK: Inspector iniciado."
  }
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
$GithubToken = if ($SetupMcp -and [string]::IsNullOrWhiteSpace($GithubToken)) { "" } else { $GithubToken }

$McpWorkspaceRoot = if ([string]::IsNullOrWhiteSpace($McpWorkspaceRoot)) { $PSScriptRoot } else { $McpWorkspaceRoot }

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

  if ($PublishAgentToWeb) {
    $webAgentDir = Join-Path $PSScriptRoot "apps\\web\\public\\agent"
    Ensure-Dir $webAgentDir
    $webExe = Join-Path $webAgentDir "Comptrol.Agent.exe"
    Copy-Item -Force $exeSource $webExe
    Write-Host "OK: EXE publicado en apps/web/public/agent (local). URL:"
    Write-Host ("     http://localhost:" + $WebPort + "/agent/Comptrol.Agent.exe")
  }

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

if ($SetupCodexSkills) {
  Setup-CodexSkills -Skills $CodexSkills
} else {
  Write-Host "INFO: Codex Skills omitidos (SetupCodexSkills=false)"
}

if ($SetupMcp) {
  Setup-Mcp -WorkspaceRoot $McpWorkspaceRoot -DbUrlForMcp $dbUrl -GithubPat $GithubToken
} else {
  Write-Host "INFO: MCP omitido (SetupMcp=false)"
}

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
