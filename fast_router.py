"""
fast_router.py - Motor de enrutamiento ultra-rapido para J.A.R.V.I.S.
Intercepta comandos directos de alta frecuencia (abrir/cerrar apps, clicks, teclas, hora)
y los ejecuta en < 5ms sin necesidad de consultar la API remota de Gemini.
Si el comando no encaja o requiere razonamiento/vision, delega en GeminiAgent.
"""

import re
import datetime
from system_tools import SystemTools, APP_COMMANDS


class FastRouter:
    """Enrutador de latencia cero para comandos nativos de Windows."""

    def __init__(self, sys_tools: SystemTools):
        self.sys_tools = sys_tools

    def try_execute(self, command: str) -> str | None:
        """
        Evalua si el comando puede ejecutarse localmente de inmediato.
        Retorna la respuesta hablada (str) si se ejecuto con exito, o None si debe ir a Gemini.
        """
        text = command.strip().lower()

        # Quitar muletillas iniciales habituales
        text = re.sub(r"^(?:por favor|puedes|podrias|quiero que|haz el favor de)\s+", "", text).strip()

        # -----------------------------------------------------------------
        # 1. HORA Y FECHA (Respuesta local en 1ms)
        # -----------------------------------------------------------------
        if re.search(r"^(?:qué hora es|dime la hora|que hora es|la hora)$", text):
            now = datetime.datetime.now()
            return f"Son las {now.strftime('%H:%M')}, Señor."

        if re.search(r"^(?:qué día es|dime el día|qué fecha es|que dia es|que fecha es|qué día es hoy|que dia es hoy|qué fecha es hoy|que fecha es hoy)(?:\s+hoy)?$", text):
            now = datetime.datetime.now()
            dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
            meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
            dia_semana = dias[now.weekday()]
            dia_num = now.day
            mes = meses[now.month - 1]
            return f"Hoy es {dia_semana} {dia_num} de {mes}, Señor."

        if any(text.startswith(g) for g in ["buenos días", "buenos dias"]):
            return "Buenos días, Señor. Todos los sistemas operativos al máximo rendimiento."

        if any(text.startswith(g) for g in ["buenas tardes"]):
            return "Buenas tardes, Señor. A su disposición."

        if any(text.startswith(g) for g in ["buenas noches"]):
            return "Buenas noches, Señor."

        # -----------------------------------------------------------------
        # 2. ABRIR APLICACIONES (Instantaneo)
        # -----------------------------------------------------------------
        m_open = re.match(
            r"^(?:abre|abrir|ejecuta|ejecutar|inicia|iniciar|pon|lanza|arranca)\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(.+)$",
            text
        )
        if m_open:
            app_query = m_open.group(1).strip()
            # Si el usuario pidio algo relacionado con vision o pantalla, NO es solo abrir
            if any(w in app_query for w in ["pantalla", "esto", "ventana activa", "que ves", "qué ves"]):
                return None

            print(f"[FAST-ROUTER] Coincidencia rapida: abrir '{app_query}'")
            res = self.sys_tools.abrir_aplicacion(app_query)
            if "iniciada" in res.lower() or "iniciando" in res.lower():
                return "Enseguida, Señor."
            return None

        # -----------------------------------------------------------------
        # 3. CERRAR APLICACIONES
        # -----------------------------------------------------------------
        m_close = re.match(
            r"^(?:cierra|cerrar|apaga|apagar|quita|quitar|mata|matar)\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(.+)$",
            text
        )
        if m_close:
            app_query = m_close.group(1).strip()
            if any(w in app_query for w in ["pantalla", "ordenador", "pc", "sistema"]):
                return None
            print(f"[FAST-ROUTER] Coincidencia rapida: cerrar '{app_query}'")
            self.sys_tools.cerrar_aplicacion(app_query)
            return "Listo, Señor."

        # -----------------------------------------------------------------
        # 4. CLICKS DE RATÓN
        # -----------------------------------------------------------------
        if re.search(r"^(?:haz\s+)?(?:doble\s+)?(?:clic|click)$", text):
            if "doble" in text:
                self.sys_tools.hacer_click(tipo="doble")
            else:
                self.sys_tools.hacer_click(tipo="izquierdo")
            return "Listo, Señor."

        if re.search(r"^(?:haz\s+)?(?:clic|click)\s+derecho$", text):
            self.sys_tools.hacer_click(tipo="derecho")
            return "Listo, Señor."

        # -----------------------------------------------------------------
        # 5. ESCRITURA RÁPIDA
        # -----------------------------------------------------------------
        m_write = re.match(r"^(?:escribe|escribir|teclea|teclear)\s+(.+)$", text)
        if m_write:
            texto_a_escribir = m_write.group(1).strip()
            print(f"[FAST-ROUTER] Escritura instantanea: '{texto_a_escribir}'")
            self.sys_tools.escribir_texto(texto_a_escribir)
            return "Listo, Señor."

        # -----------------------------------------------------------------
        # 6. TECLAS Y ATAJOS
        # -----------------------------------------------------------------
        if re.search(r"^(?:presiona|pulsa|dale\s+a(?:l)?)\s+enter$", text) or text == "enter":
            self.sys_tools.presionar_tecla("enter")
            return "Listo, Señor."

        if re.search(r"^(?:presiona|pulsa)\s+(?:la\s+tecla\s+)?(escape|esc|espacio|tab|borrar)$", text):
            tecla = "esc" if "esc" in text else ("space" if "espacio" in text else "enter")
            self.sys_tools.presionar_tecla(tecla)
            return "Listo, Señor."

        if text in ["copia", "copiar"]:
            self.sys_tools.atajo_teclado("ctrl,c")
            return "Listo, Señor."

        if text in ["pega", "pegar"]:
            self.sys_tools.atajo_teclado("ctrl,v")
            return "Listo, Señor."

        if text in ["minimiza", "minimizar", "mostrar escritorio"]:
            self.sys_tools.atajo_teclado("win,d")
            return "Listo, Señor."

        # -----------------------------------------------------------------
        # 7. AGRADECIMIENTOS / SALUDOS
        # -----------------------------------------------------------------
        if text in ["gracias", "muchas gracias", "buen trabajo"]:
            return "Para servirle, Señor."

        if text in ["hola", "buenas", "buenos dias", "buenas tardes"]:
            return "¿En qué puedo asistirle, Señor?"

        # Ningun patron local -> delegar a Gemini con razonamiento completo
        return None
