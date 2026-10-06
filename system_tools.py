"""
system_tools.py - Herramientas del sistema para J.A.R.V.I.S.
Implementa las funciones fisicas que Gemini puede invocar mediante Function Calling.
"""

import subprocess
import os
import time
from pathlib import Path

try:
    import pyautogui
    PYAUTOGUI_AVAILABLE = True
    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.1
except ImportError:
    PYAUTOGUI_AVAILABLE = False
    print("[TOOLS] pyautogui no disponible. La funcion control_interfaz estara deshabilitada.")


# ---------------------------------------------------------------
# Mapa de nombres comunes de aplicaciones a comandos del sistema
# ---------------------------------------------------------------
APP_COMMANDS = {
    # Utilidades de Windows
    "calculadora": "calc",
    "calculator": "calc",
    "notepad": "notepad",
    "bloc de notas": "notepad",
    "explorador": "explorer",
    "explorer": "explorer",
    "paint": "mspaint",
    "powershell": "powershell",
    "cmd": "cmd",
    "terminal": "wt",
    "administrador de tareas": "taskmgr",
    "task manager": "taskmgr",
    "configuracion": "ms-settings:",
    "configuracion del sistema": "ms-settings:",

    # Navegadores
    "chrome": "chrome",
    "google chrome": "chrome",
    "firefox": "firefox",
    "edge": "msedge",
    "microsoft edge": "msedge",
    "navegador": "msedge",

    # Editores / IDEs
    "vscode": "code",
    "visual studio code": "code",
    "vs code": "code",
    "cursor": "cursor",
    "pycharm": "pycharm",
    "notepad++": "notepad++",

    # Comunicacion
    "discord": "discord",
    "telegram": "telegram",
    "slack": "slack",
    "whatsapp": "whatsapp:",
    "teams": "ms-teams:",

    # Multimedia
    "spotify": "spotify",
    "vlc": "vlc",
    "musica": "spotify",

    # Office
    "word": "winword",
    "excel": "excel",
    "powerpoint": "powerpnt",
    "onenote": "onenote",
    "outlook": "outlook",

    # Gaming
    "steam": "steam",
    "epic games": "com.epicgames.launcher://",
    "sk launcher": r"C:\Users\yesas\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\SKlauncher\SKlauncher.lnk",
    "sklauncher": r"C:\Users\yesas\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\SKlauncher\SKlauncher.lnk",
    "tlauncher": r"C:\Users\yesas\AppData\Roaming\.minecraft\TLauncher.exe",
    "minecraft": r"C:\Users\yesas\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\SKlauncher\SKlauncher.lnk",
}


class SystemTools:
    """Clase que agrupa todas las herramientas de control del sistema."""

    BLOCKED_COMMANDS = [
        "format c:",
        "del /f /s /q c:\\windows",
        "rd /s /q c:\\windows",
        "rm -rf /",
        "remove-item -recurse c:\\windows",
        "shutdown /s /f",
    ]

    # --------------------------------------------------------
    # 1. ABRIR APLICACION
    # --------------------------------------------------------
    def abrir_aplicacion(self, nombre_app: str) -> str:
        """Abre una aplicacion por nombre. Intenta mapeado predefinido y luego busqueda difusa."""
        try:
            key = nombre_app.lower().strip()
            cmd = APP_COMMANDS.get(key)

            if cmd:
                if cmd.endswith(":") or "://" in cmd:
                    subprocess.Popen(["powershell", "-Command", f"Start-Process '{cmd}'"], shell=False)
                elif "\\" in cmd:
                    subprocess.Popen(["powershell", "-Command", f"Start-Process '{cmd}'"], shell=False)
                else:
                    subprocess.Popen(cmd, shell=True)
                print(f"[TOOLS] Abierta: {nombre_app} -> {cmd}")
                return f"Aplicacion '{nombre_app}' iniciada correctamente."
            else:
                # Fallback: utilizar script de busqueda difusa en el sistema
                ps1 = os.path.join(os.path.dirname(__file__), "open-app.ps1")
                if os.path.exists(ps1):
                    res = subprocess.run(
                        ["powershell", "-ExecutionPolicy", "Bypass", "-File", ps1, "-AppName", nombre_app],
                        capture_output=True, text=True, timeout=12
                    )
                    if res.returncode == 0:
                        return f"Iniciando '{nombre_app}'..."

                # Ultimo recurso: Start-Process nativo
                result = subprocess.run(
                    ["powershell", "-Command", f"Start-Process '{nombre_app}'"],
                    capture_output=True, text=True, timeout=8
                )
                if result.returncode == 0:
                    return f"Iniciando '{nombre_app}'..."
                else:
                    return f"No se encontro la aplicacion '{nombre_app}' en el sistema."

        except FileNotFoundError:
            return f"La aplicacion '{nombre_app}' no esta instalada o no se encontro."
        except subprocess.TimeoutExpired:
            return f"La apertura de '{nombre_app}' tardo demasiado."
        except Exception as e:
            print(f"[TOOLS] Error abriendo app: {e}")
            return f"Error al abrir '{nombre_app}': {str(e)}"

    # --------------------------------------------------------
    # 2. GESTIONAR ARCHIVO
    # --------------------------------------------------------
    def gestionar_archivo(self, accion: str, ruta: str, contenido: str = None) -> str:
        """Lee, crea, modifica o lista archivos y directorios del sistema."""
        try:
            path = Path(os.path.expandvars(os.path.expanduser(ruta)))

            if accion == "leer":
                if not path.exists():
                    return f"El archivo '{ruta}' no existe."
                if path.is_dir():
                    return f"'{ruta}' es un directorio. Use la accion 'listar'."
                text = path.read_text(encoding="utf-8", errors="replace")
                if len(text) > 2000:
                    text = text[:2000] + "\n... [contenido truncado a 2000 caracteres]"
                return f"Contenido de '{path.name}':\n{text}"

            elif accion == "crear":
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(contenido or "", encoding="utf-8")
                return f"Archivo '{path.name}' creado en '{path.parent}'."

            elif accion == "modificar":
                if not path.exists():
                    return f"El archivo '{ruta}' no existe. Usa 'crear' primero."
                path.write_text(contenido or "", encoding="utf-8")
                return f"Archivo '{path.name}' modificado correctamente."

            elif accion == "listar":
                if not path.exists():
                    return f"El directorio '{ruta}' no existe."
                if path.is_file():
                    return f"'{ruta}' es un archivo. Use 'leer' para verlo."
                items = sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
                if not items:
                    return f"El directorio esta vacio."
                listing = "\n".join(
                    f"  {'[DIR]' if i.is_dir() else '[FILE]'} {i.name}" for i in items[:60]
                )
                return f"Contenido de '{ruta}':\n{listing}"

            else:
                return f"Accion '{accion}' no valida. Opciones: leer, crear, modificar, listar."

        except PermissionError:
            return f"Permiso denegado para acceder a '{ruta}'."
        except Exception as e:
            print(f"[TOOLS] Error en gestionar_archivo: {e}")
            return f"Error al {accion} '{ruta}': {str(e)}"

    # --------------------------------------------------------
    # 3. EJECUTAR COMANDO TERMINAL
    # --------------------------------------------------------
    def ejecutar_comando_terminal(self, comando: str) -> str:
        """Ejecuta un comando PowerShell y devuelve su salida."""
        for blocked in self.BLOCKED_COMMANDS:
            if blocked.lower() in comando.lower():
                print(f"[TOOLS][SECURITY] Comando bloqueado: '{comando}'")
                return "Ese comando esta bloqueado por razones de seguridad."

        try:
            print(f"[TOOLS] Ejecutando: {comando}")
            result = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command", comando],
                capture_output=True,
                text=True,
                timeout=30,
                encoding="utf-8",
                errors="replace",
            )
            output = result.stdout.strip()
            errors = result.stderr.strip()

            if output:
                return output[:1500] + ("\n...[truncado]" if len(output) > 1500 else "")
            elif errors:
                return f"Error en el comando: {errors[:500]}"
            else:
                return "Comando ejecutado correctamente (sin salida visible)."

        except subprocess.TimeoutExpired:
            return "El comando excedio el tiempo limite de 30 segundos."
        except Exception as e:
            print(f"[TOOLS] Error ejecutando terminal: {e}")
            return f"Error al ejecutar comando: {str(e)}"

    # --------------------------------------------------------
    # 4. CONTROL DE INTERFAZ (pyautogui)
    # --------------------------------------------------------
    def control_interfaz(self, accion: str, parametros: dict = None) -> str:
        """Controla el raton y el teclado usando pyautogui."""
        if not PYAUTOGUI_AVAILABLE:
            return "pyautogui no esta disponible. Instala con: pip install pyautogui"

        if parametros is None:
            parametros = {}

        try:
            if accion == "click":
                x, y = parametros.get("x", 0), parametros.get("y", 0)
                pyautogui.click(x, y)
                return f"Clic realizado en ({x}, {y})."

            elif accion == "doble_click":
                x, y = parametros.get("x", 0), parametros.get("y", 0)
                pyautogui.doubleClick(x, y)
                return f"Doble clic realizado en ({x}, {y})."

            elif accion == "mover":
                x, y = parametros.get("x", 0), parametros.get("y", 0)
                pyautogui.moveTo(x, y, duration=0.4)
                return f"Raton movido a ({x}, {y})."

            elif accion == "escribir":
                texto = parametros.get("texto", "")
                time.sleep(0.3)
                pyautogui.write(texto, interval=0.05)
                return f"Texto escrito correctamente."

            elif accion == "hotkey":
                teclas = parametros.get("teclas", [])
                if isinstance(teclas, str):
                    teclas = [t.strip() for t in teclas.split(",")]
                pyautogui.hotkey(*teclas)
                return f"Atajo '{'+'.join(teclas)}' ejecutado."

            elif accion == "screenshot":
                save_path = os.path.expanduser("~/Desktop/jarvis_screenshot.png")
                pyautogui.screenshot().save(save_path)
                return f"Captura de pantalla guardada en el escritorio."

            else:
                return f"Accion '{accion}' no reconocida. Opciones: click, doble_click, mover, escribir, hotkey, screenshot."

        except pyautogui.FailSafeException:
            return "Seguro de emergencia activado (raton en esquina). Operacion cancelada."
        except Exception as e:
            print(f"[TOOLS] Error en control_interfaz: {e}")
            return f"Error en accion '{accion}': {str(e)}"
