"""
gemini_agent.py - Agente de IA para J.A.R.V.I.S.
Integra Google Gemini con Function Calling para toma de decisiones y control del sistema.
"""

import os
import google.generativeai as genai
from system_tools import SystemTools


SYSTEM_INSTRUCTION = """
Eres J.A.R.V.I.S. (Just A Rather Very Intelligent System), el asistente de IA personal avanzado.

REGLAS ABSOLUTAS:
- Siempre dirijete al usuario como "Senior".
- Responde SIEMPRE en espanol.
- Respuestas cortas y concisas: maximo 2-3 oraciones. Sin parrafos largos.
- Tono formal, elegante y eficiente. Como el asistente de Iron Man.
- NUNCA uses markdown (asteriscos, listas, guiones) ya que la respuesta se convierte a voz.
- Cuando el usuario pida acciones fisicas en el sistema, usa las herramientas disponibles.
- Confirma brevemente cada accion realizada.
- Si no entiendes, pide aclaracion de forma concisa.
"""

# ---------------------------------------------------------------
# Declaraciones de funciones (schema JSON para Gemini)
# ---------------------------------------------------------------
TOOL_DECLARATIONS = [
    {
        "name": "abrir_aplicacion",
        "description": (
            "Abre una aplicacion o programa en el sistema operativo Windows. "
            "Usa este tool cuando el usuario pida abrir una app, programa, navegador, etc."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "nombre_app": {
                    "type": "string",
                    "description": (
                        "Nombre de la aplicacion a abrir. "
                        "Ejemplos: notepad, chrome, spotify, discord, calculadora, explorer, vscode, terminal."
                    ),
                }
            },
            "required": ["nombre_app"],
        },
    },
    {
        "name": "gestionar_archivo",
        "description": (
            "Lee, crea, modifica o lista archivos y directorios en el sistema de archivos. "
            "Usa este tool cuando el usuario pida crear, leer o ver un archivo o carpeta."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "accion": {
                    "type": "string",
                    "enum": ["leer", "crear", "modificar", "listar"],
                    "description": "Operacion a realizar sobre el archivo o directorio.",
                },
                "ruta": {
                    "type": "string",
                    "description": (
                        "Ruta completa del archivo o directorio. "
                        "Admite variables de entorno como %USERPROFILE%, %TEMP%, C:\\\\PROYECTOS, etc."
                    ),
                },
                "contenido": {
                    "type": "string",
                    "description": "Texto a escribir en el archivo (solo para acciones crear y modificar).",
                },
            },
            "required": ["accion", "ruta"],
        },
    },
    {
        "name": "ejecutar_comando_terminal",
        "description": (
            "Ejecuta un comando en PowerShell y devuelve la salida como texto al modelo. "
            "Ideal para consultar informacion del sistema, listar procesos, obtener IPs, ejecutar scripts, etc."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "comando": {
                    "type": "string",
                    "description": (
                        "Comando PowerShell a ejecutar. "
                        "Ejemplos: 'Get-Process', 'Get-Date', 'ipconfig', 'ls C:\\\\PROYECTOS'."
                    ),
                }
            },
            "required": ["comando"],
        },
    },
    {
        "name": "control_interfaz",
        "description": (
            "Controla el raton y el teclado con pyautogui para interactuar con la interfaz grafica. "
            "Usa este tool cuando los otros no son suficientes para la tarea."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "accion": {
                    "type": "string",
                    "enum": ["click", "doble_click", "mover", "escribir", "hotkey", "screenshot"],
                    "description": "Tipo de accion de interfaz grafica.",
                },
                "x": {
                    "type": "integer",
                    "description": "Coordenada X de la pantalla (para click y mover).",
                },
                "y": {
                    "type": "integer",
                    "description": "Coordenada Y de la pantalla (para click y mover).",
                },
                "texto": {
                    "type": "string",
                    "description": "Texto a escribir (para accion 'escribir').",
                },
                "teclas": {
                    "type": "string",
                    "description": "Teclas de atajo separadas por coma (para 'hotkey'). Ejemplo: 'ctrl,c'.",
                },
            },
            "required": ["accion"],
        },
    },
]


class GeminiAgent:
    """
    Agente Gemini con Function Calling para J.A.R.V.I.S.
    Mantiene el historial de conversacion entre comandos.
    """

    def __init__(self):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY no esta configurada. Revisad el archivo .env")

        genai.configure(api_key=api_key)
        self._sys_tools = SystemTools()
        self.model = self._build_model()
        self.chat = self.model.start_chat(history=[])
        print("[GEMINI] Agente inicializado correctamente.")

    def _build_model(self) -> genai.GenerativeModel:
        """Construye el modelo Gemini con las herramientas definidas."""
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
            model_name="gemini-1.5-flash-latest",
            tools=[tools],
            system_instruction=SYSTEM_INSTRUCTION,
            generation_config=genai.GenerationConfig(
                temperature=0.7,
                max_output_tokens=512,
            ),
        )

    def process_command(self, command_text: str) -> str | None:
        """
        Envia un comando a Gemini y gestiona el bucle de Function Calling.

        El flujo es:
        1. Enviamos el texto del usuario.
        2. Si Gemini quiere llamar a una funcion -> la ejecutamos.
        3. Enviamos el resultado de la funcion de vuelta a Gemini.
        4. Repetimos hasta que Gemini devuelva una respuesta de texto final.
        """
        try:
            response = self.chat.send_message(command_text)

            # Bucle de function calling
            while True:
                # Buscar si hay una llamada a funcion en las partes de la respuesta
                fn_call = None
                for part in response.parts:
                    fc = getattr(part, "function_call", None)
                    if fc and fc.name:
                        fn_call = fc
                        break

                if fn_call is None:
                    # Sin llamada a funcion: extraer texto final
                    text = response.text.strip() if response.text else None
                    return text

                # Ejecutar la herramienta solicitada
                func_name = fn_call.name
                func_args = dict(fn_call.args) if fn_call.args else {}
                print(f"[GEMINI] Funcion solicitada: {func_name}({func_args})")

                result = self._dispatch(func_name, func_args)
                print(f"[GEMINI] Resultado: {str(result)[:120]}")

                # Enviar el resultado al modelo para continuar la conversacion
                response = self.chat.send_message(
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=func_name,
                            response={"result": str(result)},
                        )
                    )
                )

        except Exception as e:
            print(f"[GEMINI] Error al procesar comando: {type(e).__name__}: {e}")
            return "Ha ocurrido un error al procesar su peticion, Senior."

    def _dispatch(self, func_name: str, args: dict) -> str:
        """Enruta las llamadas a funcion de Gemini hacia la herramienta correcta."""
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
            print(f"[GEMINI][DISPATCH] Error en '{func_name}': {e}")
            return f"Error al ejecutar '{func_name}': {str(e)}"

    def reset_conversation(self):
        """Reinicia el historial de conversacion."""
        self.chat = self.model.start_chat(history=[])
        print("[GEMINI] Conversacion reiniciada.")
