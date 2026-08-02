@echo off
title J.A.R.V.I.S. Core Launcher
cd /d "c:\PROYECTOS\jarvis"
echo ===================================================
echo   INICIANDO NÚCLEO DE J.A.R.V.I.S.
echo ===================================================

:: Check if server is already running, otherwise start it in background
netstat -ano | findstr :3001 > nul
if %errorlevel% neq 0 (
    echo [SISTEMA] Iniciando servidor de control local...
    start /b node server.js > nul
    timeout /t 2 > nul
) else (
    echo [SISTEMA] El servidor local ya está en ejecución en el puerto 3001.
)

:: Try to launch Chrome in App Mode (borderless window)
echo [SISTEMA] Lanzando interfaz en modo aplicación...
start "" "chrome.exe" --app=http://localhost:3001

exit
