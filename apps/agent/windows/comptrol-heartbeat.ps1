param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$AgentKey,

  [Parameter(Mandatory = $true)]
  [string]$AssetTag
)

$ErrorActionPreference = "Stop"

function Get-PrimaryIPv4 {
  $ip = Get-NetIPAddress -AddressFamily IPv4 -InterfaceOperationalStatus Up -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -and $_.IPAddress -notlike "169.254*" -and $_.IPAddress -ne "127.0.0.1" } |
    Select-Object -First 1
  return $ip.IPAddress
}

function Get-PrimaryMac {
  $mac = Get-NetAdapter -Physical -ErrorAction SilentlyContinue |
    Where-Object { $_.Status -eq "Up" -and $_.MacAddress } |
    Select-Object -First 1
  return $mac.MacAddress
}

$os = (Get-CimInstance Win32_OperatingSystem).Caption
$serial = (Get-CimInstance Win32_BIOS).SerialNumber

$body = @{
  assetTag        = $AssetTag
  hostname        = $env:COMPUTERNAME
  ipAddress       = (Get-PrimaryIPv4)
  macAddress      = (Get-PrimaryMac)
  serialNumber    = $serial
  operatingSystem = $os
}

$json = $body | ConvertTo-Json -Depth 3

Invoke-RestMethod `
  -Method Post `
  -Uri "$ApiBaseUrl/agent/heartbeat" `
  -Headers @{ "x-agent-key" = $AgentKey } `
  -ContentType "application/json" `
  -Body $json

