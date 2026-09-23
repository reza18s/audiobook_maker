@echo off
setlocal

set "ROOT=%~dp0"
set "COMPOSE_FILE=%ROOT%deploy\docker-compose.yml"
set "NVIDIA_COMPOSE_FILE=%ROOT%deploy\docker-compose.nvidia.yml"
set "ENV_FILE=%ROOT%deploy\.env"
set "MODE=%~1"

cd /d "%ROOT%"

if not "%~2"=="" goto :usage
if /i "%MODE%"=="" goto :valid_mode
if /i "%MODE%"=="engines" goto :valid_mode
if /i "%MODE%"=="nvidia" goto :valid_mode
goto :usage

:valid_mode

where docker >nul 2>&1
if errorlevel 1 (
    echo Docker CLI was not found. Install Docker Desktop and try again.
    exit /b 1
)

docker compose version >nul 2>&1
if errorlevel 1 (
    echo Docker Compose is unavailable. Update Docker Desktop and try again.
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo Docker Engine is not running. Start Docker Desktop, then try again.
    exit /b 1
)

if not exist "%ENV_FILE%" (
    echo Missing configuration: "%ENV_FILE%"
    echo Copy deploy\.env.example to deploy\.env and set a unique AUDIOBOOK_API_TOKEN.
    exit /b 1
)

findstr /i /c:"replace-with-a-long-random-token" "%ENV_FILE%" >nul
if not errorlevel 1 (
    echo Replace the example AUDIOBOOK_API_TOKEN in deploy\.env with a unique token.
    exit /b 1
)

if /i "%MODE%"=="engines" goto :start_engines
if /i "%MODE%"=="nvidia" goto :start_nvidia

echo Starting the Audiobook Maker Docker stack...
docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" up -d --build
if errorlevel 1 goto :failed
goto :success

:start_engines
echo Starting the Audiobook Maker stack with TTS engine containers...
docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" --profile engines up -d --build
if errorlevel 1 goto :failed
goto :success

:start_nvidia
echo Starting the Audiobook Maker stack with TTS engines and NVIDIA GPU reservations...
docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" -f "%NVIDIA_COMPOSE_FILE%" --profile engines up -d --build
if errorlevel 1 goto :failed
goto :success

:failed
echo Docker Compose could not start the stack. Check the output above.
exit /b 1

:success
echo Audiobook Maker Docker stack is running. The local gateway is at http://127.0.0.1:8000.
exit /b 0

:usage
echo Usage: start_docker.bat [engines^|nvidia]
echo   No option  Starts the gateway, generation worker, and media worker.
echo   engines    Also starts the configured TTS engine containers.
echo   nvidia     Starts TTS engines with the NVIDIA Compose override.
exit /b 2
