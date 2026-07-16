# Despliegue Linux por SSH

Objetivo: publicar Comptrol-MEF en un servidor Linux para que pueda abrirse desde otra maquina.

Servidor validado:
- Host: `10.118.67.55`
- URL principal: `http://10.118.67.55`
- Login: `http://10.118.67.55/login`

## 1) Copiar el proyecto al servidor

Desde Windows:

```powershell
scp.exe -r . usr_admin@10.118.67.55:/opt/comptrol-mef
```

Si el proyecto ya existe en el servidor, puedes copiar solo los archivos actualizados o usar Git.

## 2) Preparar variables en el servidor

Entrar por SSH:

```powershell
ssh.exe usr_admin@10.118.67.55
```

Ya en Linux:

```bash
cd /opt/comptrol-mef
cp .env.server.example .env
cp apps/api/.env.docker.example apps/api/.env.docker
```

Editar `apps/api/.env.docker`:

- Cambiar `JWT_SECRET`
- Cambiar `AGENT_API_KEY` si usaras el agente

La variable `CORS_ORIGINS` del archivo `.env` debe incluir la URL real desde la que abriras la web. Si el servidor ya tiene un `nginx` en `:80`, usa tambien el origen sin puerto. Para este servidor:

```bash
CORS_ORIGINS=http://10.118.67.55,http://10.118.67.55:3000,http://localhost:3000,http://127.0.0.1:3000
```

## 3) Levantar el stack en modo servidor

En este servidor se uso `podman`, no Docker.

Script recomendado:

```bash
chmod +x scripts/linux/deploy-podman.sh
sudo ./scripts/linux/deploy-podman.sh
```

Script de estado:

```bash
chmod +x scripts/linux/status-podman.sh
sudo ./scripts/linux/status-podman.sh
```

Este modo hace dos cosas clave:

- La web escucha en `127.0.0.1:3000` y Nginx publica `:80`
- La API escucha en `127.0.0.1:3001`
- El navegador llama a `/api/v1` en la misma web, y Next reenvia internamente a la API

Si no tienes proxy delante, desde otra maquina solo necesitas abrir:

```text
http://10.118.67.55:3000
```

Si el servidor ya tiene `nginx` o Apache publicando `:80`, la URL preferida es:

```text
http://10.118.67.55
```

## 4) Validacion

En el servidor:

```bash
sudo ./scripts/linux/status-podman.sh
curl -I http://127.0.0.1/
curl http://127.0.0.1/api/v1/health/ready
```

Desde otra maquina:

```text
http://10.118.67.55
```

## 5) Si no abre desde otra maquina

Revisar estos puntos en Linux:

```bash
ss -tulpn | grep 3000
ss -tulpn | grep 3001
ss -tulpn | grep 80
sudo firewall-cmd --state
```

Si la red institucional filtra el acceso, necesitas abrir `80/tcp` en el firewall del servidor o en el firewall perimetral.

## 6) Logs utiles

```bash
sudo podman logs -f comptrol-web
sudo podman logs -f comptrol-api
sudo podman logs -f comptrol-postgres
```

## 7) Nota operativa

En `10.118.67.55`, `/var` es pequeno y `podman` guarda capas en `/var/lib/containers`.
Para evitar que el frontend se quede sin espacio:

- `node_modules` del web se dejan en `/opt/gti-app/runtime/comptrol-web/node_modules`
- el cache de npm del web se deja en `/opt/gti-app/runtime/comptrol-web/npm-cache`
