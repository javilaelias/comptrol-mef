param(
  [Parameter(Mandatory = $true)]
  [string]$ExePath,

  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$AgentKey,

  [Parameter(Mandatory = $true)]
  [string]$AssetTag,

  [string]$TaskName = "ComptrolAgentHeartbeat",
  [int]$Minutes = 15
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $ExePath)) {
  throw "No existe EXE en: $ExePath"
}

$args = "--api `"$ApiBaseUrl`" --key `"$AgentKey`" --asset-tag `"$AssetTag`""

schtasks /Create /F /TN $TaskName /SC MINUTE /MO $Minutes /RL HIGHEST /TR "`"$ExePath`" $args"

Write-Host "OK: tarea creada: $TaskName (cada $Minutes min)"

