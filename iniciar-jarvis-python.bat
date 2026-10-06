@echo off
title J.A.R.V.I.S. - Core Python
cd /d "c:\PROYECTOS\jarvis"
echo ===================================================
echo   INICIANDO NUCLEO DE J.A.R.V.I.S. (PYTHON)
echo ===================================================
set "PYTHON_CMD=python"
if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" (
    set "PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
)

"%PYTHON_CMD%" -u main.py
pause
