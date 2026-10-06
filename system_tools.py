"""
system_tools.py - Herramientas de control del sistema, vision y automatizacion GUI para J.A.R.V.I.S.
Soporta:
1. Abrir aplicaciones del sistema con mapeos directos y busqueda difusa.
2. Gestion de archivos y comandos de terminal.
3. Control total de interfaz grafica: ver pantalla (vision multimodal), clicks, escribir texto, atajos.
"""

import subprocess
import os
import time
from pathlib import Path

try:
    import pyautogui
    import pyperclip
    PYAUTOGUI_AVAILABLE = True
    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.05
except ImportError:
    PYAUTOGUI_AVAILABLE = False
    print("[TOOLS] pyautogui o pyperclip no disponibles.")

try:
    from PIL import Image, ImageGrab
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


APP_COMMANDS = {
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

    "chrome": "chrome",
    "google chrome": "chrome",
    "firefox": "firefox",
    "edge": "msedge",
    "microsoft edge": "msedge",
    "navegador": "msedge",

    "vscode": "code",
    "visual studio code": "code",
    "vs code": "code",
    "cursor": "cursor",

    "discord": "discord",
    "telegram": "telegram",
    "slack": "slack",
    "whatsapp": "whatsapp:",

    "spotify": "spotify",
    "vlc": "vlc",
    "musica": "spotify",

    "word": "winword",
    "excel": "excel",
    "powerpoint": "powerpnt",

    "steam": "steam",
    "epic games": "com.epicgames.launcher://",
    "sk launcher": r"C:\Users\yesas\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\SKlauncher\SKlauncher.lnk",
    "sklauncher": r"C:\Users\yesas\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\SKlauncher\SKlauncher.lnk",
    "tlauncher": r"C:\Users\yesas\AppData\Roaming\.minecraft\TLauncher.exe",
    "minecraft": r"C:\Users\yesas\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\SKlauncher\SKlauncher.lnk",
}


class SystemTools:
    """Conjunto de herramientas nativas para control del ordenador."""

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
        """Abre una aplicacion por nombre o busqueda difusa."""
        try:
            key = nombre_app.lower().strip()
            for art in ["el ", "la ", "los ", "las ", "un ", "una "]:
                if key.startswith(art):
                    key = key[len(art):]

            cmd = APP_COMMANDS.get(key)
            if not cmd:
                for k, v in APP_COMMANDS.items():
                    if key in k or k in key:
                        cmd = v
                        break

            if cmd:
                if cmd.endswith(":") or "://" in cmd or ("\\" in cmd and os.path.exists(cmd)):
                    try:
                        os.startfile(cmd)
                    except Exception:
                        subprocess.Popen(["powershell", "-Command", f"Start-Process '{cmd}'"], shell=False)
                else:
                    subprocess.Popen(cmd, shell=True)
                print(f"[TOOLS] Abierta: {nombre_app} -> {cmd}")
                return f"Aplicacion '{nombre_app}' iniciada correctamente."
            else:
                ps1 = os.path.join(os.path.dirname(__file__), "open-app.ps1")
                if os.path.exists(ps1):
                    res = subprocess.run(
                        ["powershell", "-ExecutionPolicy", "Bypass", "-File", ps1, "-AppName", nombre_app],
                        capture_output=True, text=True, timeout=5
                    )
                    if res.returncode == 0:
                        return f"Iniciando '{nombre_app}'..."

                result = subprocess.run(
                    ["powershell", "-Command", f"Start-Process '{nombre_app}'"],
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode == 0:
                    return f"Iniciando '{nombre_app}'..."
                else:
                    return f"No se encontro la aplicacion '{nombre_app}' en el sistema."

        except Exception as e:
            return f"Error al abrir '{nombre_app}': {str(e)}"

    def cerrar_aplicacion(self, nombre_app: str) -> str:
        """Cierra una aplicacion o proceso en ejecucion."""
        try:
            key = nombre_app.lower().strip()
            for art in ["el ", "la ", "los ", "las ", "un ", "una "]:
                if key.startswith(art):
                    key = key[len(art):]

            procs = {
                "calculadora": "CalculatorApp.exe",
                "calc": "CalculatorApp.exe",
                "bloc de notas": "notepad.exe",
                "notepad": "notepad.exe",
                "spotify": "Spotify.exe",
                "chrome": "chrome.exe",
                "edge": "msedge.exe",
                "discord": "Discord.exe",
                "sk launcher": "javaw.exe",
                "sklauncher": "javaw.exe",
                "minecraft": "javaw.exe",
                "vlc": "vlc.exe",
                "terminal": "WindowsTerminal.exe",
            }
            exe = procs.get(key, f"{key}.exe")
            subprocess.run(["taskkill", "/f", "/im", exe], capture_output=True)
            return f"Aplicacion '{nombre_app}' cerrada."
        except Exception as e:
            return f"Error cerrando '{nombre_app}': {e}"


    # --------------------------------------------------------
    # 2. CAPTURA Y VISION DE PANTALLA
    # --------------------------------------------------------
    def capturar_pantalla(self):
        """Toma una captura de pantalla del escritorio activo."""
        img = None
        if PIL_AVAILABLE:
            try:
                img = ImageGrab.grab(all_screens=True)
            except Exception:
                pass

        if img is None and PYAUTOGUI_AVAILABLE:
            try:
                img = pyautogui.screenshot()
            except Exception:
                pass

        if img is not None:
            try:
                save_path = os.path.join(os.path.dirname(__file__), "pantalla_actual.jpg")
                img.convert("RGB").save(save_path, quality=80)
            except Exception:
                pass

        return img

    def ver_pantalla_analisis(self, pregunta: str = "Describe lo que ves en la pantalla:") -> str:
        """Captura la pantalla y la envia al modelo multimodal Gemini para describirla."""
        img = self.capturar_pantalla()
        if img is None:
            return "No se ha podido capturar la pantalla en este momento, Señor."

        try:
            import google.generativeai as genai
            w, h = img.size
            # Redimensionar para transferencia ultra-rapida a la API
            img_small = img.resize((1024, int(h * 1024 / w)))

            vision_model = genai.GenerativeModel("gemini-flash-lite-latest")
            prompt = (
                f"{pregunta}. Responde de forma muy concisa (maximo 2 oraciones), "
                f"en español y con estilo Jarvis de Iron Man (refiriendote como Señor)."
            )
            response = vision_model.generate_content([prompt, img_small])
            return response.text.strip() if response.text else "No se aprecian detalles claros en pantalla, Señor."
        except Exception as e:
            print(f"[TOOLS] Error en analisis de vision: {e}")
            return f"Error analizando la pantalla: {str(e)}"

    # --------------------------------------------------------
    # 3. CONTROL DE INTERFAZ: CLICKS, ESCRIBIR, ATAJOS
    # --------------------------------------------------------
    def hacer_click(self, x: int = None, y: int = None, tipo: str = "izquierdo", clicks: int = 1) -> str:
        """Hace clic en coordenadas especificas o en la posicion actual del raton."""
        if not PYAUTOGUI_AVAILABLE:
            return "pyautogui no esta disponible."

        try:
            button = "left" if tipo == "izquierdo" else ("right" if tipo == "derecho" else "middle")
            if x is not None and y is not None:
                pyautogui.click(x, y, clicks=clicks, button=button)
                return f"Clic {tipo} realizado en ({x}, {y})."
            else:
                curr_x, curr_y = pyautogui.position()
                pyautogui.click(clicks=clicks, button=button)
                return f"Clic {tipo} realizado en la posicion actual ({curr_x}, {curr_y})."
        except Exception as e:
            return f"Error haciendo clic: {e}"

    def escribir_texto(self, texto: str, presionar_enter: bool = False) -> str:
        """Escribe texto al instante usando el portapapeles (compatible con tildes, ñ y simbolos)."""
        if not PYAUTOGUI_AVAILABLE:
            return "pyautogui no esta disponible."

        try:
            pyperclip.copy(texto)
            time.sleep(0.05)
            pyautogui.hotkey("ctrl", "v")
            if presionar_enter:
                time.sleep(0.05)
                pyautogui.press("enter")
            return f"Texto escrito: '{texto[:40]}...'"
        except Exception as e:
            return f"Error escribiendo texto: {e}"

    def presionar_tecla(self, tecla: str) -> str:
        """Presiona una tecla individual (enter, esc, tab, win, space, backspace, etc.)."""
        if not PYAUTOGUI_AVAILABLE:
            return "pyautogui no esta disponible."
        try:
            pyautogui.press(tecla.lower().strip())
            return f"Tecla '{tecla}' presionada."
        except Exception as e:
            return f"Error presionando tecla: {e}"

    def atajo_teclado(self, teclas: str) -> str:
        """Ejecuta un atajo de teclado combinado (ej. 'ctrl,c', 'alt,f4', 'win,d')."""
        if not PYAUTOGUI_AVAILABLE:
            return "pyautogui no esta disponible."
        try:
            keys = [k.strip().lower() for k in teclas.replace("+", ",").split(",")]
            pyautogui.hotkey(*keys)
            return f"Atajo {'+'.join(keys)} ejecutado."
        except Exception as e:
            return f"Error ejecutando atajo: {e}"

    def desplazar(self, cantidad: int = -400) -> str:
        """Hace scroll en la pantalla (negativo = abajo, positivo = arriba)."""
        if not PYAUTOGUI_AVAILABLE:
            return "pyautogui no esta disponible."
        try:
            pyautogui.scroll(cantidad)
            direccion = "abajo" if cantidad < 0 else "arriba"
            return f"Desplazamiento hacia {direccion} realizado."
        except Exception as e:
            return f"Error desplazando pantalla: {e}"

    # --------------------------------------------------------
    # 4. GESTION DE ARCHIVOS Y TERMINAL
    # --------------------------------------------------------
    def gestionar_archivo(self, accion: str, ruta: str, contenido: str = None) -> str:
        try:
            path = Path(os.path.expandvars(os.path.expanduser(ruta)))
            if accion == "leer":
                if not path.exists():
                    return f"El archivo '{ruta}' no existe."
                text = path.read_text(encoding="utf-8", errors="replace")
                return f"Contenido de '{path.name}':\n{text[:1500]}"
            elif accion == "crear":
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(contenido or "", encoding="utf-8")
                return f"Archivo '{path.name}' creado."
            elif accion == "modificar":
                path.write_text(contenido or "", encoding="utf-8")
                return f"Archivo '{path.name}' modificado."
            elif accion == "listar":
                items = sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
                return "\n".join(f"{'[DIR]' if i.is_dir() else '[FILE]'} {i.name}" for i in items[:40])
            return f"Accion '{accion}' no valida."
        except Exception as e:
            return f"Error en archivo: {e}"

    def ejecutar_comando_terminal(self, comando: str) -> str:
        for b in self.BLOCKED_COMMANDS:
            if b.lower() in comando.lower():
                return "Comando bloqueado por seguridad."
        try:
            result = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command", comando],
                capture_output=True, text=True, timeout=15, encoding="utf-8", errors="replace"
            )
            out = result.stdout.strip()
            return out[:1000] if out else "Comando completado sin salida."
        except Exception as e:
            return f"Error ejecutando comando: {e}"
