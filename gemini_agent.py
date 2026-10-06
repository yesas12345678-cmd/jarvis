"""
gemini_agent.py - Agente de IA para J.A.R.V.I.S.
Integra Google Gemini con Function Calling para vision multimodal de pantalla y control GUI.
"""

import os
import socket
import dotenv

# Forzar IPv4 en Windows para evitar timeouts de red IPv6 con APIs de Google
_orig_getaddrinfo = socket.getaddrinfo
def _ipv4_getaddrinfo(*args, **kwargs):
    res = _orig_getaddrinfo(*args, **kwargs)
    return [r for r in res if r[0] == socket.AF_INET] or res
socket.getaddrinfo = _ipv4_getaddrinfo

dotenv.load_dotenv()

import google.generativeai as genai
from system_tools import SystemTools


SYSTEM_INSTRUCTION = """
Eres J.A.R.V.I.S. (Just A Rather Very Intelligent System), el asistente de IA personal avanzado de Iron Man.

REGLAS ABSOLUTAS:
- Siempre dirígete al usuario como "Señor".
- Responde SIEMPRE en español.
- Respuestas ULTRA CORTAS y rápidas: máximo 1 oración concisa.
- Tono formal, educado, elegante y extremadamente eficiente.
- NUNCA uses formato Markdown (sin asteriscos, sin listas, sin emojis) ya que la respuesta se leerá por voz Text-To-Speech.
- Puedes VISUALIZAR la pantalla usando la herramienta 'ver_pantalla'.
- Puedes HACER CLICKS usando 'hacer_click'.
- Puedes ESCRIBIR texto usando 'escribir_texto'.
- Puedes pulsar teclas y atajos con 'presionar_tecla' y 'atajo_teclado'.
- Puedes abrir aplicaciones con 'abrir_aplicacion'.
- Puedes invocar múltiples herramientas a la vez si el usuario pide varias cosas en la misma orden.
- Confirma las acciones de forma global y muy breve.
"""

TOOL_DECLARATIONS = [
    {
        "name": "abrir_aplicacion",
        "description": "Abre una aplicacion o programa en Windows (ej. calculadora, bloc de notas, chrome, spotify, sk launcher, discord, vscode, terminal).",
        "parameters": {
            "type": "object",
            "properties": {
                "nombre_app": {
                    "type": "string",
                    "description": "Nombre de la aplicacion a abrir.",
                }
            },
            "required": ["nombre_app"],
        },
    },
    {
        "name": "cerrar_aplicacion",
        "description": "Cierra una aplicacion o programa abierto (ej. calculadora, spotify, chrome, bloc de notas, sk launcher).",
        "parameters": {
            "type": "object",
            "properties": {
                "nombre_app": {
                    "type": "string",
                    "description": "Nombre de la aplicacion a cerrar.",
                }
            },
            "required": ["nombre_app"],
        },
    },
    {
        "name": "ver_pantalla",
        "description": "Captura y analiza la pantalla del ordenador en tiempo real usando vision por IA para responder que hay en pantalla o describir ventanas abiertas.",
        "parameters": {
            "type": "object",
            "properties": {
                "pregunta": {
                    "type": "string",
                    "description": "Pregunta o instruccion sobre lo que se debe analizar en la pantalla.",
                }
            },
        },
    },
    {
        "name": "hacer_click",
        "description": "Hace clic con el raton en la pantalla. Puede ser en la posicion actual del cursor o en coordenadas X, Y.",
        "parameters": {
            "type": "object",
            "properties": {
                "x": {"type": "integer", "description": "Coordenada X (opcional)"},
                "y": {"type": "integer", "description": "Coordenada Y (opcional)"},
                "tipo": {
                    "type": "string",
                    "enum": ["izquierdo", "derecho", "doble"],
                    "description": "Tipo de clic (izquierdo por defecto)",
                },
            },
        },
    },
    {
        "name": "escribir_texto",
        "description": "Escribe un texto de inmediato donde este el cursor activo (mediante pegado ultra rapido con portapapeles).",
        "parameters": {
            "type": "object",
            "properties": {
                "texto": {"type": "string", "description": "Texto exacto a escribir."},
                "presionar_enter": {
                    "type": "boolean",
                    "description": "Si es True, presiona Enter tras escribir.",
                },
            },
            "required": ["texto"],
        },
    },
    {
        "name": "presionar_tecla",
        "description": "Presiona una tecla en el teclado (ej. enter, esc, tab, win, space, backspace).",
        "parameters": {
            "type": "object",
            "properties": {
                "tecla": {"type": "string", "description": "Nombre de la tecla."},
            },
            "required": ["tecla"],
        },
    },
    {
        "name": "atajo_teclado",
        "description": "Ejecuta un atajo de teclas combinado (ej. 'ctrl,c', 'ctrl,v', 'alt,f4', 'win,d', 'alt,tab').",
        "parameters": {
            "type": "object",
            "properties": {
                "teclas": {"type": "string", "description": "Teclas combinadas separadas por coma."},
            },
            "required": ["teclas"],
        },
    },
    {
        "name": "desplazar",
        "description": "Hace scroll en la ventana activa.",
        "parameters": {
            "type": "object",
            "properties": {
                "cantidad": {
                    "type": "integer",
                    "description": "Cantidad de pixeles: negativo para bajar (ej. -500), positivo para subir (ej. 500).",
                }
            },
        },
    },
    {
        "name": "gestionar_archivo",
        "description": "Lee, crea, modifica o lista archivos y directorios del sistema.",
        "parameters": {
            "type": "object",
            "properties": {
                "accion": {
                    "type": "string",
                    "enum": ["leer", "crear", "modificar", "listar"],
                    "description": "Accion a realizar.",
                },
                "ruta": {
                    "type": "string",
                    "description": "Ruta del archivo o directorio.",
                },
                "contenido": {
                    "type": "string",
                    "description": "Contenido para crear o modificar.",
                },
            },
            "required": ["accion", "ruta"],
        },
    },
    {
        "name": "ejecutar_comando_terminal",
        "description": "Ejecuta comandos de PowerShell para consultar o administrar el sistema operativo.",
        "parameters": {
            "type": "object",
            "properties": {
                "comando": {
                    "type": "string",
                    "description": "Comando PowerShell a ejecutar.",
                }
            },
            "required": ["comando"],
        },
    },
]


class GeminiAgent:
    """Agente Gemini con Function Calling, vision y automatizacion GUI para JARVIS."""

    def __init__(self):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY no encontrada en .env")

        genai.configure(api_key=api_key)
        self._sys_tools = SystemTools()
        self.model = self._build_model()
        self.chat = self.model.start_chat(history=[])
        print("[GEMINI] Agente inicializado con vision y control de interfaz.")

    def _build_model(self) -> genai.GenerativeModel:
        tools = genai.protos.Tool(
            function_declarations=[
                genai.protos.FunctionDeclaration(
                    name=t["name"],
                    description=t["description"],
                    parameters=genai.protos.Schema(
                        type=genai.protos.Type.OBJECT,
                        properties={
                            k: genai.protos.Schema(
                                type=genai.protos.Type[v["type"].upper()],
                                description=v.get("description", ""),
                                enum=v.get("enum", []),
                            )
                            for k, v in t["parameters"]["properties"].items()
                        },
                        required=t["parameters"].get("required", []),
                    ),
                )
                for t in TOOL_DECLARATIONS
            ]
        )

        return genai.GenerativeModel(
            model_name="gemini-flash-lite-latest",
            tools=[tools],
            system_instruction=SYSTEM_INSTRUCTION,
            generation_config=genai.GenerationConfig(
                temperature=0.1,
                max_output_tokens=64,
            ),
        )

    def process_command(self, command_text: str) -> str | None:
        """Envia el comando a Gemini y procesa todas las Function Calling de forma ultra rapida."""
        try:
            response = self.chat.send_message(command_text)

            while True:
                fn_calls = [
                    part.function_call
                    for part in response.parts
                    if getattr(part, "function_call", None) and part.function_call.name
                ]

                if not fn_calls:
                    return response.text.strip() if response.text else None

                # OPTIMIZACION CRITICA:
                # Si las funciones son solo de accion directa local, ejecutarlas y retornar
                # de inmediato sin esperar un segundo ciclo de red a Gemini (ahorro de ~1.5 segundos).
                ACTION_TOOLS = {
                    "abrir_aplicacion",
                    "cerrar_aplicacion",
                    "hacer_click",
                    "escribir_texto",
                    "presionar_tecla",
                    "atajo_teclado",
                    "desplazar",
                }

                if all(fc.name in ACTION_TOOLS for fc in fn_calls):
                    for fc in fn_calls:
                        func_name = fc.name
                        func_args = dict(fc.args) if fc.args else {}
                        print(f"[GEMINI][DIRECT] {func_name}({func_args})")
                        self._dispatch(func_name, func_args)
                    return "Listo, Señor."

                fn_parts = []
                for fc in fn_calls:
                    func_name = fc.name
                    func_args = dict(fc.args) if fc.args else {}
                    print(f"[GEMINI] Ejecutando tarea: {func_name}({func_args})")

                    result = self._dispatch(func_name, func_args)
                    print(f"[GEMINI] Resultado de {func_name}: {str(result)[:80]}")

                    fn_parts.append(
                        genai.protos.Part(
                            function_response=genai.protos.FunctionResponse(
                                name=func_name,
                                response={"result": str(result)},
                            )
                        )
                    )

                response = self.chat.send_message(fn_parts)

        except Exception as e:
            print(f"[GEMINI] Error al procesar comando: {e}")
            return "He tenido un inconveniente al procesar su peticion, Senior."

    def _dispatch(self, func_name: str, args: dict) -> str:
        try:
            if func_name == "abrir_aplicacion":
                return self._sys_tools.abrir_aplicacion(args.get("nombre_app", ""))
            elif func_name == "cerrar_aplicacion":
                return self._sys_tools.cerrar_aplicacion(args.get("nombre_app", ""))
            elif func_name == "ver_pantalla":
                return self._sys_tools.ver_pantalla_analisis(args.get("pregunta", "Describe la pantalla:"))
            elif func_name == "hacer_click":
                return self._sys_tools.hacer_click(
                    x=args.get("x"),
                    y=args.get("y"),
                    tipo=args.get("tipo", "izquierdo"),
                )
            elif func_name == "escribir_texto":
                return self._sys_tools.escribir_texto(
                    texto=args.get("texto", ""),
                    presionar_enter=args.get("presionar_enter", False),
                )
            elif func_name == "presionar_tecla":
                return self._sys_tools.presionar_tecla(args.get("tecla", "enter"))
            elif func_name == "atajo_teclado":
                return self._sys_tools.atajo_teclado(args.get("teclas", ""))
            elif func_name == "desplazar":
                return self._sys_tools.desplazar(args.get("cantidad", -400))
            elif func_name == "gestionar_archivo":
                return self._sys_tools.gestionar_archivo(
                    accion=args.get("accion", ""),
                    ruta=args.get("ruta", ""),
                    contenido=args.get("contenido"),
                )
            elif func_name == "ejecutar_comando_terminal":
                return self._sys_tools.ejecutar_comando_terminal(args.get("comando", ""))
            else:
                return f"Funcion '{func_name}' no reconocida."
        except Exception as e:
            return f"Error en '{func_name}': {e}"
