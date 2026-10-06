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
    print("  J.A.R.V.I.S. - Just A Rather Very Intelligent System")
    print("  Version 3.2 | Motor: Dual (Fast-Router 0ms + Gemini 2.5)")
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
    print("[JARVIS] SISTEMAS COMPLETAMENTE OPERATIVOS.")
    print("[JARVIS] Puede decir directamente frases como:")
    print("         - 'Jarvis, abre la calculadora' (Respuesta instantanea 0ms)")
    print("         - 'Jarvis, abre spotify'")
    print("         - 'Jarvis, qué hora es'")
    print("         - 'Jarvis, ¿qué ves en mi pantalla?'")
    print("[JARVIS] Presione Ctrl+C para salir.")
    print("=" * 62 + "\n")

    tts.speak("Sistemas en linea. J.A.R.V.I.S. a su servicio, Señor.")

    def shutdown(sig=None, frame=None):
        print("\n[JARVIS] Desconectando sistemas...")
        tts.speak("Hasta luego, Señor.")
        audio.close()
        tts.close()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, shutdown)

    while True:
        try:
            status, command = audio.listen_and_capture()
            if status is None:
                continue

            # Si solo dijo "Jarvis", emitir pitido y pedir la orden
            if not command:
                tts.speak_activation()
                print("\n[JARVIS] >>> ¿Qué desea ordenar, Señor? (hable ahora) <<<")
                command = audio.record_followup()

            if not command:
                tts.speak("¿En qué puedo asistirle, Señor?")
                continue

            tts.speak_processing()
            print(f"\n[JARVIS] Ejecutando orden: \"{command}\"")

            # 1. RUTA ULTRA-RAPIDA LOCAL (0ms llamadas de red, ejecucion instantanea)
            fast_response = router.try_execute(command)
            if fast_response:
                print(f"[JARVIS][FAST-PATH] Accion resuelta de inmediato.")
                tts.speak(fast_response)
                print("\n[JARVIS] Esperando nueva orden...\n")
                continue

            # 2. INTELIGENCIA GEMINI (para vision, preguntas y logica compleja)
            response_text = agent.process_command(command)

            if response_text:
                tts.speak(response_text)
            else:
                print("[JARVIS] Sin respuesta del agente.")

            print("\n[JARVIS] Esperando nueva orden...\n")

        except KeyboardInterrupt:
            shutdown()
        except Exception as e:
            print(f"[JARVIS][ERROR]: {e}")
            import time
            time.sleep(1.0)
            continue


if __name__ == "__main__":
    main()
