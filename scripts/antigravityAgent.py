"""
Antigravity Coding Agent — Motor de desarrollo autónomo potenciado por Antigravity SDK.
Reemplaza al codingAgent.mjs básico, dando acceso completo a todas las herramientas
de Antigravity (edición inteligente, browser, MCP, búsqueda semántica, etc.)

Uso: python scripts/antigravityAgent.py --task "descripción de la tarea" [--cwd "directorio"]
"""
import asyncio
import sys
import os
import json
import argparse
from dotenv import load_dotenv

# Cargar variables de entorno (.env)
load_dotenv()

# Configurar stdout como UTF-8 para Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from google.antigravity import Agent, LocalAgentConfig, CapabilitiesConfig
import google.antigravity.policy as ag_policy


async def run_coding_task(task_prompt: str, working_dir: str):
    """
    Ejecuta una tarea de programación usando un agente real de Antigravity
    con acceso completo a todas sus herramientas.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    abs_work_dir = os.path.abspath(working_dir)

    system_instructions = f"""Eres Jude, un agente de desarrollo autónomo de élite trabajando en el PC de Manuel.
Directorio de trabajo: {abs_work_dir}

REGLAS ESTRICTAS:
1. Trabaja de forma AUTÓNOMA — no pidas confirmación, ejecuta directamente tus herramientas.
2. Crea archivos de producción completos y funcionales, nunca stubs ni placeholders.
3. Después de crear o modificar código, ejecútalo para verificar que funciona sin errores.
4. Si necesitas instalar dependencias, hazlo con pip o npm según corresponda.
5. Al terminar, haz git add, git commit descriptivo y git push origin main si hay repositorio git.
6. Reporta tu progreso de forma concisa pero completa.
7. Trabaja dentro del directorio especificado o crea subdirectorios según necesites.
"""

    skills_paths = [
        p for p in [
            os.path.join(abs_work_dir, ".agents", "skills"),
            os.path.expanduser(r"~\.gemini\config\skills"),
            os.path.expanduser(r"~\.gemini\antigravity-ide\builtin\skills"),
        ] if os.path.exists(p)
    ]

    config = LocalAgentConfig(
        system_instructions=system_instructions,
        capabilities=CapabilitiesConfig(),
        policies=[ag_policy.allow_all()],
        workspaces=[abs_work_dir],
        skills_paths=skills_paths,
        api_key=api_key,
    )

    print(f"🚀 [ANTIGRAVITY AGENT] Iniciando agente con tarea:")
    print(f"   📋 {task_prompt}")
    print(f"   📁 Directorio: {abs_work_dir}")
    print(f"   🔧 Herramientas: TODAS habilitadas (Antigravity SDK)")
    print("=" * 60)

    full_response = []

    try:
        async with Agent(config) as agent:
            response = await agent.chat(task_prompt)

            async for token in response:
                sys.stdout.write(token)
                sys.stdout.flush()
                full_response.append(token)

        final_text = "".join(full_response)
        if not final_text.strip() and hasattr(response, "text") and response.text:
            final_text = response.text

        print("\n" + "=" * 60)
        print("✅ [ANTIGRAVITY AGENT] Tarea completada con éxito.")
        return final_text or "Tarea completada con éxito."

    except Exception as e:
        error_msg = f"❌ [ANTIGRAVITY AGENT] Error: {str(e)}"
        print(error_msg)
        return error_msg


async def main():
    parser = argparse.ArgumentParser(description="Antigravity Coding Agent")
    parser.add_argument("--task", required=True, help="Descripción de la tarea a realizar")
    parser.add_argument("--cwd", default=os.getcwd(), help="Directorio de trabajo")
    parser.add_argument("--output-json", action="store_true", help="Salida en formato JSON")

    args = parser.parse_args()

    result = await run_coding_task(args.task, args.cwd)

    if args.output_json:
        output = {
            "status": "error" if result.startswith("❌") else "success",
            "summary": result[:2000],
        }
        print("\n__RESULT_JSON__")
        print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
