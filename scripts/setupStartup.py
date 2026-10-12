import os

appdata = os.environ.get("APPDATA")
startup = os.path.join(appdata, r"Microsoft\Windows\Start Menu\Programs\Startup")
target_bat = os.path.join(startup, "Jude-PC-Bridge.bat")

with open(target_bat, "w", encoding="utf-8") as f:
    f.write('@echo off\nstart /b wscript.exe "c:\\PROYECTOS\\jarvis\\scripts\\iniciar-puente-silencioso.vbs"\n')

print("Lanzador automatico creado exitosamente en:", target_bat)
