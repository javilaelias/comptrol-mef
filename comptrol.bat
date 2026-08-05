@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Comptrol-MEF launcher (Windows CMD)
rem Usage:
rem   comptrol.bat                 -> up (Docker: DB+API+Web)
rem   comptrol.bat up              -> up (Docker: DB+API+Web)
rem   comptrol.bat down            -> down (Docker: stop stack)
rem   comptrol.bat setup           -> setup (Docker: db + migrate + seed)
rem   comptrol.bat dev             -> dev (local: API+Web)
rem   comptrol.bat api             -> API only
rem   comptrol.bat web             -> Web only
rem   comptrol.bat mobile          -> Mobile (Expo)
rem   comptrol.bat init            -> install deps + migrate + seed
rem   comptrol.bat migrate         -> prisma migrate dev
rem   comptrol.bat seed            -> prisma seed
rem   comptrol.bat import docs     -> import xls/xlsx
rem   comptrol.bat import enad     -> import pdf
rem   comptrol.bat import all      -> import docs + enad
rem   comptrol.bat import reset    -> reset + import docs + enad
rem   comptrol.bat job docs        -> Docker job: import xls/xlsx
rem   comptrol.bat job docs reset  -> Docker job: reset + import xls/xlsx
rem   comptrol.bat db up           -> levanta PostgreSQL (Docker)
rem   comptrol.bat db down         -> baja PostgreSQL (Docker)
rem   comptrol.bat db logs         -> logs de PostgreSQL (Docker)
rem   comptrol.bat db reset        -> recrea volumen (Docker)
rem   comptrol.bat help            -> show help

cd /d "%~dp0"

set "CMD=%~1"
if "%CMD%"=="" set "CMD=up"

if /i "%CMD%"=="help" goto :help
if /i "%CMD%"=="-h" goto :help
if /i "%CMD%"=="--help" goto :help

if /i "%CMD%"=="dev" goto :dev
if /i "%CMD%"=="start" goto :dev
if /i "%CMD%"=="api" goto :api
if /i "%CMD%"=="web" goto :web
if /i "%CMD%"=="mobile" goto :mobile
if /i "%CMD%"=="init" goto :init
if /i "%CMD%"=="migrate" goto :migrate
if /i "%CMD%"=="seed" goto :seed
if /i "%CMD%"=="import" goto :import
if /i "%CMD%"=="job" goto :job
if /i "%CMD%"=="db" goto :db
if /i "%CMD%"=="setup" goto :setup
if /i "%CMD%"=="up" goto :up
if /i "%CMD%"=="down" goto :down

echo [ERROR] Comando no reconocido: "%CMD%"
echo.
goto :help

:help
echo Comptrol-MEF - launcher (Windows)
echo.
echo Uso:
echo   comptrol.bat ^<cmd^> [args]
echo.
echo Comandos:
echo   dev            Inicia API + Web (desarrollo)
echo   api            Inicia solo API (desarrollo)
echo   web            Inicia solo Web (desarrollo)
echo   mobile         Inicia Mobile (Expo)
echo   init           Instala deps + migrate + seed
echo   migrate        Ejecuta migraciones (Prisma)
echo   seed           Ejecuta semilla (Prisma)
echo   import docs    Importa inventario/licencias/apps desde /docs
echo   import enad    Importa ENAD desde PDF a tablas operativas
echo   import all     Importa docs + enad
echo   import reset   Limpia y reimporta (IMPORT_RESET=1)
echo   job docs       Docker job: importa docs (/docs) a PostgreSQL
echo   job docs reset Docker job: limpia y reimporta docs (IMPORT_RESET=1)
echo   db up          Levanta PostgreSQL (Docker)
echo   db down        Baja PostgreSQL (Docker)
echo   db logs        Muestra logs PostgreSQL (Docker)
echo   db reset       Recrea volumen PostgreSQL (Docker)
echo   setup          Docker: db + migrate + seed
echo   up             Docker: DB + API + Web
echo   down           Docker: baja el stack
echo.
echo Notas:
echo - Local: usa apps\api\.env (PostgreSQL local)
echo - Docker: usa apps\api\.env.docker (docker compose)
echo - Web: http://localhost:3000  ^|  API: http://localhost:3001\api\v1
exit /b 0

:require_tools
where node >nul 2>nul || (echo [ERROR] Node.js no encontrado en PATH. && exit /b 1)
where npm  >nul 2>nul || (echo [ERROR] npm no encontrado en PATH. && exit /b 1)
exit /b 0

:require_docker
where docker >nul 2>nul || (echo [ERROR] Docker no encontrado en PATH. Instala Docker Desktop. && exit /b 1)
docker compose version >nul 2>nul || (echo [ERROR] Docker Compose no disponible. Actualiza Docker Desktop. && exit /b 1)
exit /b 0

:ensure_deps
call :require_tools || exit /b 1
if exist "node_modules\" exit /b 0
echo [INFO] Instalando dependencias (npm ci)...
call npm ci
if errorlevel 1 (echo [ERROR] Fallo instalando dependencias. && exit /b 1)
exit /b 0

:ensure_env
if exist "apps\api\.env" exit /b 0
if exist "apps\api\.env.example" (
  echo [INFO] No existe apps\api\.env. Creando desde apps\api\.env.example ...
  copy "apps\api\.env.example" "apps\api\.env" >nul
  if errorlevel 1 (
    echo [ERROR] No se pudo crear apps\api\.env.
    exit /b 1
  )
  echo [INFO] OK. Revisa apps\api\.env si necesitas cambiar credenciales/host.
  exit /b 0
)
echo [ERROR] Falta apps\api\.env y apps\api\.env.example.
echo         Crea apps\api\.env con DATABASE_URL y JWT_SECRET.
exit /b 1

:sleep
set "SLEEP_SECS=%~1"
if "%SLEEP_SECS%"=="" set "SLEEP_SECS=2"
powershell -NoProfile -Command "Start-Sleep -Seconds %SLEEP_SECS%" >nul
exit /b 0

:ensure_env_docker
if exist "apps\api\.env.docker" exit /b 0
if exist "apps\api\.env.docker.example" (
  echo [INFO] No existe apps\api\.env.docker. Creando desde apps\api\.env.docker.example ...
  copy "apps\api\.env.docker.example" "apps\api\.env.docker" >nul
  if errorlevel 1 (
    echo [ERROR] No se pudo crear apps\api\.env.docker.
    exit /b 1
  )
  echo [INFO] OK. Revisa apps\api\.env.docker si necesitas cambiar credenciales/host.
  exit /b 0
)
echo [ERROR] Falta apps\api\.env.docker y apps\api\.env.docker.example.
exit /b 1

:wait_db_ready
set "TRIES=0"
:wait_db_try
set /a TRIES+=1
docker compose exec -T db pg_isready -U postgres -d comptrol >nul 2>nul
if not errorlevel 1 exit /b 0
if %TRIES% GEQ 30 (
  echo [ERROR] PostgreSQL no est???? listo (timeout).
  exit /b 1
)
call :sleep 2
goto :wait_db_try

:migrate_with_retry
set "TRIES=0"
:migrate_try
set /a TRIES+=1
call npm run migrate
if not errorlevel 1 exit /b 0
if %TRIES% GEQ 10 (
  echo [ERROR] migrate fallo tras %TRIES% intentos.
  exit /b 1
)
echo [WARN] migrate fallo (intento %TRIES%/10). Reintentando en 3s...
call :sleep 3
goto :migrate_try

:dev
call :ensure_deps || exit /b 1
call :ensure_env || exit /b 1
echo [INFO] Levantando API + Web (npm run dev)...
call npm run dev
exit /b %errorlevel%

:api
call :ensure_deps || exit /b 1
call :ensure_env || exit /b 1
echo [INFO] Levantando API (npm run dev:api)...
call npm run dev:api
exit /b %errorlevel%

:web
call :ensure_deps || exit /b 1
echo [INFO] Levantando Web (npm run dev:web)...
call npm run dev:web
exit /b %errorlevel%

:mobile
call :ensure_deps || exit /b 1
echo [INFO] Levantando Mobile (npm run dev:mobile)...
call npm run dev:mobile
exit /b %errorlevel%

:init
call :ensure_deps || exit /b 1
call :ensure_env || exit /b 1
echo [INFO] Migraciones (npm run migrate)...
call :migrate_with_retry || exit /b 1
echo [INFO] Semilla (npm run seed)...
call npm run seed
exit /b %errorlevel%

:migrate
call :ensure_deps || exit /b 1
call :ensure_env || exit /b 1
call :migrate_with_retry
exit /b %errorlevel%

:seed
call :ensure_deps || exit /b 1
call :ensure_env || exit /b 1
call npm run seed
exit /b %errorlevel%

:import
set "WHAT=%~2"
if "%WHAT%"=="" (
  echo [ERROR] Falta argumento: docs ^| enad ^| all ^| reset
  exit /b 1
)

call :ensure_deps || exit /b 1
call :ensure_env || exit /b 1

if /i "%WHAT%"=="docs" (
  call npm run import:docs
  exit /b %errorlevel%
)

if /i "%WHAT%"=="enad" (
  call npm run import:enad
  exit /b %errorlevel%
)

if /i "%WHAT%"=="all" (
  call npm run import:docs || exit /b 1
  call npm run import:enad
  exit /b %errorlevel%
)

if /i "%WHAT%"=="reset" (
  set "IMPORT_RESET=1"
  call npm run import:docs || exit /b 1
  call npm run import:enad
  exit /b %errorlevel%
)

echo [ERROR] Argumento no reconocido para import: "%WHAT%"
exit /b 1

:job
set "JOB=%~2"
set "JOBARG=%~3"
if "%JOB%"=="" (
  echo [ERROR] Falta argumento: docs
  exit /b 1
)

call :require_docker || exit /b 1
call :ensure_env_docker || exit /b 1

if /i "%JOB%"=="docs" (
  echo [INFO] Levantando PostgreSQL (Docker) si no est?? activo...
  docker compose up -d db || exit /b 1
  call :wait_db_ready || exit /b 1

  if /i "%JOBARG%"=="reset" (
    echo [INFO] Import docs (Docker job) con IMPORT_RESET=1...
    docker compose --profile jobs run --rm -e IMPORT_RESET=1 import-docs
    exit /b %errorlevel%
  )

  echo [INFO] Import docs (Docker job)...
  docker compose --profile jobs run --rm import-docs
  exit /b %errorlevel%
)

echo [ERROR] Argumento no reconocido para job: "%JOB%"
exit /b 1

:db
set "DBCMD=%~2"
if "%DBCMD%"=="" (
  echo [ERROR] Falta argumento: up ^| down ^| logs ^| reset
  exit /b 1
)

call :require_docker || exit /b 1

if /i "%DBCMD%"=="up" (
  docker compose up -d db
  exit /b %errorlevel%
)

if /i "%DBCMD%"=="down" (
  docker compose stop db
  exit /b %errorlevel%
)

if /i "%DBCMD%"=="logs" (
  docker compose logs -f db
  exit /b %errorlevel%
)

if /i "%DBCMD%"=="reset" (
  docker compose stop db >nul 2>nul
  docker compose rm -sf db >nul 2>nul
  docker volume rm -f comptrol_pgdata >nul 2>nul
  docker compose up -d db
  exit /b %errorlevel%
)

echo [ERROR] Argumento no reconocido para db: "%DBCMD%"
exit /b 1

:setup
call :require_docker || exit /b 1
call :ensure_env_docker || exit /b 1
echo [INFO] Levantando PostgreSQL (Docker)...
docker compose up -d db || exit /b 1
call :wait_db_ready || exit /b 1
echo [INFO] Migraciones + seed (Docker)...
docker compose --profile app run --rm api sh -lc "test -x node_modules/.bin/nest || npm ci; npx prisma generate; npx prisma migrate deploy; npm run db:seed" || exit /b 1
exit /b %errorlevel%

:up
call :require_docker || exit /b 1
call :setup || exit /b 1
set "DETACH=%~2"
if /i "%DETACH%"=="-d" (
  docker compose --profile app up -d api web
  exit /b %errorlevel%
)
if /i "%DETACH%"=="--detach" (
  docker compose --profile app up -d api web
  exit /b %errorlevel%
)
docker compose --profile app up api web
exit /b %errorlevel%

:down
call :require_docker || exit /b 1
docker compose --profile app down
exit /b %errorlevel%
