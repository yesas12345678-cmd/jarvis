@echo off
title J.A.R.V.I.S. Core Launcher
cd /d "c:\PROYECTOS\jarvis"
echo ===================================================
echo   INICIANDO NUCLEO DE JUDE / J.A.R.V.I.S.
echo ===================================================

:: Detect Chrome or Edge executable
set "BROWSER_EXE="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)

:: Check if server is already running on port 3001
netstat -ano | findstr :3001 > nul
if %errorlevel% equ 0 goto server_already_running

echo [SISTEMA] Iniciando servidor Next.js en puerto 3001...
start "Jude Core Server" /min cmd.exe /k "npm run dev"
echo [SISTEMA] Esperando a que el nucleo inicialice...

set retries=0
:wait_server
timeout /t 1 /nobreak > nul 2>nul || ping 127.0.0.1 -n 2 > nul
set /a retries+=1
curl.exe -s -I http://localhost:3001 > nul 2>nul
if %errorlevel% equ 0 goto server_ready
if %retries% lss 25 goto wait_server

:server_ready
echo [SISTEMA] Nucleo listo y en linea.
goto launch_browser

:server_already_running
echo [SISTEMA] El servidor local ya esta en ejecucion en el puerto 3001.

:launch_browser
echo [SISTEMA] Lanzando interfaz en modo aplicacion...
if defined BROWSER_EXE (
    start "" "%BROWSER_EXE%" --app=http://localhost:3001 --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream
) else (
    start http://localhost:3001
)

timeout /t 2 /nobreak > nul 2>nul || ping 127.0.0.1 -n 3 > nul
powershell -ExecutionPolicy Bypass -File move-to-current-desktop.ps1

exit
