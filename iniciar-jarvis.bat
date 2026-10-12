@echo off
title J.A.R.V.I.S. Core Launcher
cd /d "c:\PROYECTOS\jarvis"
echo ===================================================
echo   INICIANDO NÚCLEO DE J.A.R.V.I.S.
echo ===================================================

:: Check if server is already running, otherwise start Next.js in background
netstat -ano | findstr :3001 > nul
if %errorlevel% neq 0 (
    echo [SISTEMA] Iniciando servidor Next.js en puerto 3001...
    start /min "Jude Core Server" cmd /c "npm run dev"
    echo [SISTEMA] Esperando a que el nucleo inicialice...
    set /a retries=0
    :wait_server
    timeout /t 1 /nobreak > nul 2>nul || ping 127.0.0.1 -n 2 > nul
    set /a retries+=1
    curl.exe -s -I http://localhost:3001 > nul 2>nul
    if errorlevel 1 (
        if %retries% lss 25 goto wait_server
    )
    echo [SISTEMA] Nucleo listo y en linea.
) else (
    echo [SISTEMA] El servidor local ya esta en ejecucion en el puerto 3001.
)

:: Try to launch Chrome in App Mode (borderless window)
echo [SISTEMA] Lanzando interfaz en modo aplicacion...
start "" "chrome.exe" --app=http://localhost:3001 --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream
timeout /t 2 /nobreak > nul 2>nul || ping 127.0.0.1 -n 3 > nul
powershell -ExecutionPolicy Bypass -File move-to-jarvis-desktop.ps1

exit
