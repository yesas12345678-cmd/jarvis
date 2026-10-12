"""
main.py - Bucle principal de J.A.R.V.I.S.
Orquestador inteligente con captura continua en espanol, Gemini y TTS.
"""

import os
import sys
import signal
from dotenv import load_dotenv

load_dotenv()

from audio_handler import AudioHandler
from gemini_agent import GeminiAgent
from tts_handler import TTSHandler
from fast_router import FastRouter


def main():
    print("=" * 62)
    print("  J U D E  - Asistente de Inteligencia Artificial Personal")
    print("  Version 4.0 | Motor: Dual (Fast-Router 0ms + Gemini Multimodal)")
    print("=" * 62)

    if not os.environ.get("GEMINI_API_KEY"):
        print("[ERROR] Falta GEMINI_API_KEY en el archivo .env")
        sys.exit(1)

    print("\n[INIT] Inicializando subsistemas...\n")

    audio = AudioHandler()
    tts = TTSHandler()
    agent = GeminiAgent()
    router = FastRouter(agent._sys_tools)

    print("\n" + "=" * 62)
    print("[JUDE] SISTEMAS COMPLETAMENTE OPERATIVOS.")
    print("[JUDE] Puede decir directamente frases como:")
    print("       - 'Jude, abre la calculadora' (Respuesta instantanea 0ms)")
    print("       - 'Jude, abre spotify'")
    print("       - 'Jude, qué hora es'")
    print("       - 'Jude, ¿qué ves en mi pantalla?'")
    print("[JUDE] Presione Ctrl+C para salir.")
    print("=" * 62 + "\n")

    tts.speak("Sistemas en línea. Jude a su servicio, Manuel.")

    def shutdown(sig=None, frame=None):
        print("\n[JUDE] Desconectando sistemas...")
        tts.speak("Hasta luego, Manuel.")
        audio.close()
        tts.close()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, shutdown)

    def handle_command(cmd: str) -> bool:
        """
        Ejecuta la orden (via FastRouter o Gemini) y reproduce la voz.
        Retorna True para mantener la conversacion activa, o False para cerrarla.
        """
        if not cmd or not cmd.strip():
            return False

        clean = cmd.strip()
        lower = clean.lower()

        # Palabras de cierre explícito
        if any(w in lower for w in ["adiós", "adios", "hasta luego", "descansa", "nada más", "nada mas", "apágate", "cierra sesión"]):
            tts.speak("A su disposición, Manuel.")
            return False

        tts.speak_processing()
        print(f"\n[JUDE] Ejecutando: \"{clean}\"")

        # 1. RUTA ULTRA-RAPIDA LOCAL (< 5ms local, 0ms latencia de red)
        fast_resp = router.try_execute(clean)
        if fast_resp:
            print(f"[JUDE][FAST-PATH] Accion resuelta de inmediato.")
            tts.speak(fast_resp)
            return True

        # 2. INTELIGENCIA GEMINI (para vision, preguntas y logica compleja)
        gemini_resp = agent.process_command(clean)
        if gemini_resp:
            tts.speak(gemini_resp)
            return True
        else:
            print("[JUDE] Sin respuesta del agente.")
            return False

    while True:
        try:
            status, command = audio.listen_and_capture()
            if status is None:
                continue

            # Si solo dijo "Jude" o "Oye Jude", dar acuse de recibo y esperar la orden
            if not command:
                tts.speak_activation()
                print("\n[JUDE] >>> Dígame, Manuel (hable ahora) <<<")
                command = audio.record_followup(wait_seconds=5.0)
                if not command:
                    tts.speak("¿En qué puedo asistirle, Manuel?")
                    command = audio.record_followup(wait_seconds=6.0)

            if not command:
                continue

            # -------------------------------------------------------------
            # BUCLE DE CONVERSACION CONTINUA:
            # Mientras el usuario siga hablando, NO necesita volver a decir "Jude"
            # -------------------------------------------------------------
            current_cmd = command
            while current_cmd:
                should_continue = handle_command(current_cmd)
                if not should_continue:
                    break

                print("\n[JUDE] [Conversacion Activa] Escuchando (hable sin decir Jude)...")
                current_cmd = audio.record_followup(wait_seconds=6.0)

            print("\n[JUDE] Modo reposo. Diga 'Jude' para una nueva orden.\n")


        except KeyboardInterrupt:
            shutdown()
        except Exception as e:
            print(f"[JARVIS][ERROR]: {e}")
            import time
            time.sleep(1.0)
            continue


if __name__ == "__main__":
    main()
