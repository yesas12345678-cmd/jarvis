"""
main.py - Bucle principal de J.A.R.V.I.S.
Orquesta el pipeline completo: wake word -> grabacion -> STT -> Gemini -> TTS.
"""

import os
import sys
import signal
from dotenv import load_dotenv

# Cargar variables de entorno ANTES de importar los modulos
load_dotenv()

from audio_handler import AudioHandler
from gemini_agent import GeminiAgent
from tts_handler import TTSHandler


def verify_environment() -> bool:
    """Verifica que las variables de entorno necesarias esten configuradas."""
    missing = []
    if not os.environ.get("GEMINI_API_KEY"):
        missing.append("GEMINI_API_KEY")
    if missing:
        print(f"[ERROR] Faltan variables de entorno en .env: {', '.join(missing)}")
        return False
    return True


def main():
    print("=" * 62)
    print("  J.A.R.V.I.S. - Just A Rather Very Intelligent System")
    print("  Version 3.0 | Motor: Python + Gemini + edge-tts")
    print("=" * 62)

    if not verify_environment():
        sys.exit(1)

    # ---- Inicializar subsistemas ----
    print("\n[INIT] Cargando subsistemas...\n")

    try:
        audio = AudioHandler()
        print("[INIT] OK - Sistema de audio")
    except Exception as e:
        print(f"[INIT] ERROR - Audio: {e}")
        sys.exit(1)

    tts = TTSHandler()
    print("[INIT] OK - Sintetizador de voz (edge-tts)")

    try:
        agent = GeminiAgent()
        print("[INIT] OK - Agente Gemini con Function Calling")
    except Exception as e:
        print(f"[INIT] ERROR - Gemini: {e}")
        sys.exit(1)

    print("\n" + "=" * 62)
    print("[JARVIS] Todos los sistemas operativos.")
    print("[JARVIS] Di 'Hey Jarvis' para activar (o presiona Enter en modo texto).")
    print("[JARVIS] Presiona Ctrl+C para salir.")
    print("=" * 62 + "\n")

    # Anuncio de inicio
    tts.speak("Sistemas en linea. J.A.R.V.I.S. listo para operar. A su servicio, Senior.")

    # ---- Manejador de cierre gracioso ----
    def shutdown(sig=None, frame=None):
        print("\n[JARVIS] Cerrando sistemas...")
        tts.speak("Apagando sistemas. Hasta pronto, Senior.")
        audio.close()
        tts.close()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, shutdown)

    # ---- BUCLE PRINCIPAL ----
    while True:
        try:
            # PASO 1: Escucha pasiva -> esperar wake word
            detected = audio.listen_for_wake_word()
            if not detected:
                continue

            # PASO 2: Sonido de activacion
            tts.speak_activation()

            # PASO 3: Grabar comando con VAD
            print("[JARVIS] Escuchando comando...")
            audio_bytes = audio.record_command()

            if audio_bytes is None:
                print("[JARVIS] Sin voz detectada. Volviendo a escucha pasiva.\n")
                continue

            # PASO 4: Transcripcion de voz a texto (STT)
            command_text = audio.transcribe(audio_bytes)

            if not command_text:
                tts.speak("No he podido entender, Senior. Por favor, repita el comando.")
                continue

            print(f"[JARVIS] Comando recibido: '{command_text}'")

            # PASO 5: Procesar con Gemini (incluye Function Calling automatico)
            response_text = agent.process_command(command_text)

            # PASO 6: Hablar la respuesta final
            if response_text:
                tts.speak(response_text)
            else:
                print("[JARVIS] Sin respuesta del agente.")

            print("[JARVIS] Volviendo a escucha pasiva...\n")

        except KeyboardInterrupt:
            shutdown()
        except Exception as e:
            print(f"[JARVIS][ERROR] Error inesperado en el bucle principal: {e}")
            # No crashear; continuar el bucle
            continue


if __name__ == "__main__":
    main()
