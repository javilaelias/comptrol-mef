param(
  [string]$Runtime = "win-x64",
  [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$proj = Join-Path $PSScriptRoot "Comptrol.Agent/Comptrol.Agent.csproj"
$outDir = Join-Path $PSScriptRoot "out"

dotnet publish $proj -c $Configuration -r $Runtime -p:PublishSingleFile=true -p:SelfContained=true -o $outDir

Write-Host "OK: $outDir\\Comptrol.Agent.exe"

