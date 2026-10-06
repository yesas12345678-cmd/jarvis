"""
tts_handler.py - Sintesis de voz para J.A.R.V.I.S.
Genera audio con edge-tts y reproduce en memoria con sounddevice y soundfile.
Compatible con Python 3.14+.
"""

import asyncio
import io
import os
import time

try:
    import edge_tts
    EDGE_TTS_AVAILABLE = True
except ImportError:
    EDGE_TTS_AVAILABLE = False
    print("[TTS] edge-tts no disponible. Instala con: pip install edge-tts")

try:
    import soundfile as sf
    import sounddevice as sd
    AUDIO_PLAYBACK_AVAILABLE = True
except ImportError:
    AUDIO_PLAYBACK_AVAILABLE = False
    print("[TTS] sounddevice o soundfile no disponibles.")

try:
    import winsound
    WINSOUND_AVAILABLE = True
except ImportError:
    WINSOUND_AVAILABLE = False

DEFAULT_VOICE = os.environ.get("JARVIS_VOICE", "es-ES-AlvaroNeural")
DEFAULT_RATE = os.environ.get("JARVIS_RATE", "+25%")


class TTSHandler:
    """
    Gestor de Text-to-Speech para JARVIS.
    Genera audio con edge-tts a velocidad acelerada y lo reproduce directamente en memoria con sounddevice.
    """

    def __init__(self, voice: str = DEFAULT_VOICE, rate: str = DEFAULT_RATE):
        self.voice = voice
        self.rate = rate
        print(f"[TTS] Voz configurada: {self.voice} (velocidad: {self.rate})")

    def speak(self, text: str):
        """Convierte texto a voz y lo reproduce de forma bloqueante."""
        if not text or not text.strip():
            return

        print(f"[JARVIS] -> {text}")

        if not EDGE_TTS_AVAILABLE or not AUDIO_PLAYBACK_AVAILABLE:
            print("[TTS] Reproduccion no disponible. Mensaje mostrado en consola.")
            return

        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                audio_bytes = loop.run_until_complete(self._generate_audio(text))
            finally:
                loop.close()

            if audio_bytes:
                self._play_bytes(audio_bytes)

        except Exception as e:
            print(f"[TTS] Error en sintesis de voz: {e}")

    async def _generate_audio(self, text: str) -> bytes:
        """Genera audio MP3 con edge-tts de forma asincrona a mayor velocidad."""
        communicate = edge_tts.Communicate(text, self.voice, rate=self.rate)
        chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)

    def _play_bytes(self, audio_bytes: bytes):
        """Reproduce los bytes de audio directamente a traves de sounddevice."""
        try:
            data, samplerate = sf.read(io.BytesIO(audio_bytes))
            sd.play(data, samplerate)
            sd.wait()
        except Exception as e:
            print(f"[TTS] Error al reproducir audio: {e}")

    def speak_activation(self):
        """Reproduce un sonido de activacion rapido cuando se detecta el wake word."""
        if WINSOUND_AVAILABLE:
            try:
                winsound.Beep(988, 100)   # B5
                time.sleep(0.04)
                winsound.Beep(1318, 120)  # E6
                return
            except Exception:
                pass
        print("[JARVIS] *BEEP BEEP* - Escuchando...")

    def close(self):
        try:
            if AUDIO_PLAYBACK_AVAILABLE:
                sd.stop()
        except Exception:
            pass
