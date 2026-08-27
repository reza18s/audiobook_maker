@echo off
setlocal
cd /d "%~dp0"

if exist "frontend\src-tauri\target\release\audiobook-maker.exe" (
    start "Audiobook Maker" "frontend\src-tauri\target\release\audiobook-maker.exe"
    exit /b 0
)

if not exist "frontend\package.json" (
    echo The Tauri desktop client is not present.
    exit /b 1
)

where bun >nul 2>&1
if not errorlevel 1 (
    cd frontend
    bun run tauri dev
    exit /b
)

echo Bun is required to start the Tauri development client.
echo Install Bun, or build the Windows installer with the documented setup.
exit /b 1
