"""
tts_handler.py - Sintesis de voz para J.A.R.V.I.S.
Usa edge-tts (voces Microsoft de alta calidad) con pygame para la reproduccion.
"""

import asyncio
import os
import tempfile
import time

try:
    import edge_tts
    EDGE_TTS_AVAILABLE = True
except ImportError:
    EDGE_TTS_AVAILABLE = False
    print("[TTS] edge-tts no disponible. Instala con: pip install edge-tts")

try:
    import pygame
    pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
    PYGAME_AVAILABLE = True
except ImportError:
    PYGAME_AVAILABLE = False
    print("[TTS] pygame no disponible. Sin reproduccion de audio.")

try:
    import winsound
    WINSOUND_AVAILABLE = True
except ImportError:
    WINSOUND_AVAILABLE = False

# Voz por defecto: voz masculina espanola de Microsoft Edge
DEFAULT_VOICE = os.environ.get("JARVIS_VOICE", "es-ES-AlvaroNeural")


class TTSHandler:
    """
    Gestor de Text-to-Speech para JARVIS.
    Genera audio con edge-tts y lo reproduce con pygame.
    """

    def __init__(self, voice: str = DEFAULT_VOICE):
        self.voice = voice
        print(f"[TTS] Voz configurada: {self.voice}")

    def speak(self, text: str):
        """
        Convierte texto a voz y lo reproduce de forma bloqueante.
        Intenta edge-tts; si falla, imprime el texto como fallback.
        """
        if not text or not text.strip():
            return

        print(f"[JARVIS] -> {text}")

        if not EDGE_TTS_AVAILABLE or not PYGAME_AVAILABLE:
            print("[TTS] Reproduccion de audio no disponible. Respuesta mostrada en consola.")
            return

        try:
            # Usar un event loop nuevo para la llamada asincrona de edge-tts
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                audio_data = loop.run_until_complete(self._generate_audio(text))
            finally:
                loop.close()

            if audio_data:
                self._play_mp3_bytes(audio_data)

        except Exception as e:
            print(f"[TTS] Error en sintesis de voz: {e}")

    async def _generate_audio(self, text: str) -> bytes:
        """Genera el audio MP3 con edge-tts de forma asincrona."""
        communicate = edge_tts.Communicate(text, self.voice)
        chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)

    def _play_mp3_bytes(self, audio_bytes: bytes):
        """Guarda los bytes como archivo temporal y los reproduce con pygame."""
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name

            pygame.mixer.music.load(tmp_path)
            pygame.mixer.music.play()

            # Esperar a que termine la reproduccion
            while pygame.mixer.music.get_busy():
                pygame.time.wait(50)

            pygame.mixer.music.unload()

        except Exception as e:
            print(f"[TTS] Error reproduciendo audio: {e}")
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass

    def speak_activation(self):
        """
        Reproduce un sonido de activacion (doble beep) cuando se detecta el wake word.
        Usa winsound en Windows para mayor velocidad.
        """
        if WINSOUND_AVAILABLE:
            try:
                winsound.Beep(880, 120)
                time.sleep(0.05)
                winsound.Beep(1320, 120)
                return
            except Exception:
                pass
        # Fallback visual
        print("[JARVIS] *BEEP BEEP* - Escuchando...")

    def close(self):
        """Libera recursos de audio."""
        try:
            if PYGAME_AVAILABLE:
                pygame.mixer.quit()
        except Exception:
            pass
