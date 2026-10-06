"""
gemini_agent.py - Agente de IA para J.A.R.V.I.S.
Integra Google Gemini con Function Calling para toma de decisiones y control del sistema.
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

# Cargar variables de entorno
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
- El usuario puede pedirte VARIAS tareas o acciones simultáneas en una sola orden (ej. 'abre spotify y abre la calculadora'). Puedes y DEBES invocar todas las herramientas necesarias a la vez.
- Confirma las acciones de forma global y muy breve.
"""

TOOL_DECLARATIONS = [
    {
        "name": "abrir_aplicacion",
        "description": "Abre una aplicacion o programa en Windows (ej. calculadora, bloc de notas, chrome, spotify, discord, vscode, terminal).",
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
    {
        "name": "control_interfaz",
        "description": "Controla el raton o teclado con pyautogui para acciones visuales (click, mover, escribir, atajos).",
        "parameters": {
            "type": "object",
            "properties": {
                "accion": {
                    "type": "string",
                    "enum": ["click", "doble_click", "mover", "escribir", "hotkey", "screenshot"],
                    "description": "Accion de interfaz.",
                },
                "x": {"type": "integer", "description": "Coordenada X"},
                "y": {"type": "integer", "description": "Coordenada Y"},
                "texto": {"type": "string", "description": "Texto a escribir"},
                "teclas": {"type": "string", "description": "Atajo de teclas"},
            },
            "required": ["accion"],
        },
    },
]


class GeminiAgent:
    """Agente Gemini con Function Calling para JARVIS."""

    def __init__(self):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY no encontrada en .env")

        genai.configure(api_key=api_key)
        self._sys_tools = SystemTools()
        self.model = self._build_model()
        self.chat = self.model.start_chat(history=[])
        print("[GEMINI] Agente inicializado con gemini-flash-lite-latest.")

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
        """Envia el comando a Gemini y procesa todas las Function Calling (simultaneas o secuenciales)."""
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
            elif func_name == "gestionar_archivo":
                return self._sys_tools.gestionar_archivo(
                    accion=args.get("accion", ""),
                    ruta=args.get("ruta", ""),
                    contenido=args.get("contenido"),
                )
            elif func_name == "ejecutar_comando_terminal":
                return self._sys_tools.ejecutar_comando_terminal(args.get("comando", ""))
            elif func_name == "control_interfaz":
                params = {
                    "x": args.get("x", 0),
                    "y": args.get("y", 0),
                    "texto": args.get("texto", ""),
                    "teclas": args.get("teclas", ""),
                }
                return self._sys_tools.control_interfaz(args.get("accion", ""), params)
            else:
                return f"Funcion '{func_name}' no reconocida."
        except Exception as e:
            return f"Error en '{func_name}': {e}"
