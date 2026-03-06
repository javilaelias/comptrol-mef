# Descubrimiento / censado de activos (propuesta)

Para que Comptrol‑MEF se “alimente solo” se recomienda un enfoque híbrido:

## 1) Agente (heartbeat) — MVP rápido y confiable
- Un script/servicio liviano en cada PC/laptop reporta `assetTag`, `hostname`, `IP`, `MAC`, `OS` y actualiza `lastSeenAt`.
- Ventajas: exactitud (equipo realmente encendido), no depende de permisos de red, sirve para teletrabajo/VPN.
- Implementado en este repo:
  - Endpoint: `POST /api/v1/agent/heartbeat` (header `x-agent-key`)
  - Script Windows: `apps/agent/windows/comptrol-heartbeat.ps1`

## 2) Integración con herramientas existentes (sin agente “nuevo”)
Si el MEF ya usa Intune/SCCM/Active Directory/EDR/RMM, se puede extraer inventario y estado por API y alimentar la CMDB.

## 3) Escaneo de red (agentless)
Para sedes donde se puede escanear, un “scanner” (nmap/arp/snmp) detecta IP/MAC/hostname.
- Ventajas: cero despliegue en endpoints.
- Desventajas: no ve teletrabajo fuera de red, ni equipos apagados.

Recomendación: empezar con (1) para tener “en uso / stale” real y complementar con (3) para descubrir equipos no inventariados.

