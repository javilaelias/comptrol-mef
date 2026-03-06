# Agente mínimo (heartbeat)

Objetivo: que cada PC/laptop reporte “estoy vivo” (última conexión) y algunos metadatos al API para alimentar el dashboard (activos en uso vs. “stale”).

En esta versión MVP se usa un **API key** por cabecera:
- Header: `x-agent-key: <AGENT_API_KEY>`
- Endpoint: `POST /api/v1/agent/heartbeat`

Config (API): `apps/api/.env` debe incluir `AGENT_API_KEY`.

Scripts:
- Windows: `apps/agent/windows/comptrol-heartbeat.ps1`

