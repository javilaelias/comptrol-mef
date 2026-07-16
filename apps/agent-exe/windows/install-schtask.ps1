param(
  [Parameter(Mandatory = $true)]
  [string]$ExePath,

  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$AgentKey,

  # Recomendado: usar serialNumber (BIOS) para matching. AssetTag es opcional.
  [string]$AssetTag = "",

  [ValidateSet("heartbeat", "inventory")]
  [string]$Mode = "inventory",

  [string]$TaskName = "ComptrolAgentInventory",
  [int]$Minutes = 60,

  [bool]$RunAsSystem = $true
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $ExePath)) {
  throw "No existe EXE en: $ExePath"
}

$args = "--api `"$ApiBaseUrl`" --key `"$AgentKey`" --mode `"$Mode`""
if (-not [string]::IsNullOrWhiteSpace($AssetTag)) {
  $args += " --asset-tag `"$AssetTag`""
}

if ($RunAsSystem) {
  schtasks /Create /F /TN $TaskName /RU SYSTEM /SC MINUTE /MO $Minutes /RL HIGHEST /TR "`"$ExePath`" $args"
} else {
  schtasks /Create /F /TN $TaskName /SC MINUTE /MO $Minutes /RL HIGHEST /TR "`"$ExePath`" $args"
}

Write-Host "OK: tarea creada: $TaskName (cada $Minutes min)"
