@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

set "RELEASE_EXE=%ROOT%frontend\src-tauri\target\release\audiobook-maker.exe"

if exist "%RELEASE_EXE%" (
    start "Audiobook Maker" "%RELEASE_EXE%"
    exit /b 0
)

if not exist "frontend\package.json" (
    echo The Tauri desktop client is not present.
    exit /b 1
)

where bun >nul 2>&1
if not errorlevel 1 (
    if not exist "%ROOT%frontend\node_modules\.bin\tauri.cmd" (
        echo Frontend dependencies are not installed.
        echo Run "cd frontend && bun install" first.
        exit /b 1
    )
    cd /d "%ROOT%frontend"
    bun run tauri dev
    exit /b
)

echo Bun is required to start the Tauri development client.
echo Install Bun, or build the Windows installer with the documented setup.
exit /b 1
