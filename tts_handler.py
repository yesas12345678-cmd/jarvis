"""
tts_handler.py - Sintesis de voz ultra-rapida para J.A.R.V.I.S.
Mantiene un bucle asyncio precalentado en un hilo de fondo para evitar latencias de conexion.
Velocidad acelerada (+35%) y reproduccion directa en memoria.
"""

import asyncio
import io
import os
import threading
import soundfile as sf
import sounddevice as sd

try:
    import edge_tts
    EDGE_TTS_AVAILABLE = True
except ImportError:
    EDGE_TTS_AVAILABLE = False

try:
    import winsound
    WINSOUND_AVAILABLE = True
except ImportError:
    WINSOUND_AVAILABLE = False

DEFAULT_VOICE = os.environ.get("JARVIS_VOICE", "es-ES-AlvaroNeural")
DEFAULT_RATE = os.environ.get("JARVIS_RATE", "+35%")


class TTSHandler:
    """Gestor de voz optimizado para baja latencia."""

    def __init__(self, voice: str = DEFAULT_VOICE, rate: str = DEFAULT_RATE):
        self.voice = voice
        self.rate = rate

        # Iniciar bucle de eventos persistente en un hilo daemon dedicado
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._loop.run_forever, daemon=True)
        self._thread.start()

        print(f"[TTS] Motor activo: {self.voice} (velocidad: {self.rate})")

    def speak(self, text: str):
        """Genera y reproduce el audio con la menor latencia posible."""
        if not text or not text.strip():
            return

        print(f"[JARVIS] -> {text}")

        if not EDGE_TTS_AVAILABLE:
            return

        try:
            future = asyncio.run_coroutine_threadsafe(self._generate_audio(text), self._loop)
            audio_bytes = future.result(timeout=6.0)

            if audio_bytes:
                data, samplerate = sf.read(io.BytesIO(audio_bytes))
                sd.play(data, samplerate)
                sd.wait()

        except Exception as e:
            print(f"[TTS] Error en audio: {e}")

    async def _generate_audio(self, text: str) -> bytes:
        """Descarga los chunks de audio a maxima velocidad."""
        communicate = edge_tts.Communicate(text, self.voice, rate=self.rate)
        chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)

    def speak_activation(self):
        """Sonido de confirmacion de 80ms."""
        if WINSOUND_AVAILABLE:
            try:
                winsound.Beep(1200, 70)
                return
            except Exception:
                pass
        print("[JARVIS] *BEEP*")

    def speak_processing(self):
        """Tick sutil de 40ms al capturar la orden."""
        if WINSOUND_AVAILABLE:
            try:
                winsound.Beep(880, 45)
            except Exception:
                pass

    def close(self):
        try:
            self._loop.call_soon_threadsafe(self._loop.stop)
            sd.stop()
        except Exception:
            pass
