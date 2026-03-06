# Agente EXE (Windows)

Este agente se compila como `.exe` y envía un “heartbeat” al API para actualizar `lastSeenAt` y metadatos básicos del equipo.

## Configuración
En `apps/api/.env` define:
- `AGENT_API_KEY="..."` (mismo valor que usará el agente)

## Build (genera .exe)
Desde la raíz del repo:
```powershell
dotnet publish apps/agent-exe/Comptrol.Agent/Comptrol.Agent.csproj -c Release -r win-x64 -p:PublishSingleFile=true -p:SelfContained=true
```

O usando el script:
```powershell
.\apps\agent-exe\build.ps1
```

Salida:
- `apps/agent-exe/Comptrol.Agent/bin/Release/net9.0/win-x64/publish/Comptrol.Agent.exe`
- `apps/agent-exe/out/Comptrol.Agent.exe` (si usas `build.ps1`)

## Uso (ejemplo)
```powershell
.\Comptrol.Agent.exe --api http://localhost:3001/api/v1 --key "<AGENT_API_KEY>" --asset-tag "COD-PATRIMONIAL"
```

Tip: luego se instala como “Tarea programada” (cada 15 min) o como servicio.

## Instalar como tarea programada (Windows)
```powershell
.\apps\agent-exe\windows\install-schtask.ps1 `
  -ExePath "C:\Comptrol\Comptrol.Agent.exe" `
  -ApiBaseUrl "http://localhost:3001/api/v1" `
  -AgentKey "<AGENT_API_KEY>" `
  -AssetTag "740805000951"
```
