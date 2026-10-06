"""
tts_handler.py - Sintesis de voz ultra-rapida para J.A.R.V.I.S.
Incluye pre-cache en RAM de frases habituales para reproduccion instantanea en 0ms.
Bucle asyncio persistente precalentado para respuestas generativas.
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

COMMON_PHRASES = [
    "Enseguida, Señor.",
    "Listo, Señor.",
    "A la orden, Señor.",
    "De inmediato, Señor.",
    "Para servirle, Señor.",
    "¿En qué puedo asistirle, Señor?",
    "Sistemas en linea. J.A.R.V.I.S. a su servicio, Señor.",
    "Hasta luego, Señor.",
    "No le he entendido, Señor.",
    "Calculadora abierta.",
    "Spotify iniciado.",
]


class TTSHandler:
    """Gestor de voz optimizado para baja latencia con cache en memoria."""

    def __init__(self, voice: str = DEFAULT_VOICE, rate: str = DEFAULT_RATE):
        self.voice = voice
        self.rate = rate
        self._cache = {}

        # Iniciar bucle de eventos persistente en hilo daemon
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._loop.run_forever, daemon=True)
        self._thread.start()

        print(f"[TTS] Motor activo: {self.voice} (velocidad: {self.rate})")

        # Pre-cargar frases comunes en segundo plano
        threading.Thread(target=self._preload_cache, daemon=True).start()

    def _preload_cache(self):
        """Descarga y almacena frases comunes en RAM para 0ms de retardo."""
        try:
            for phrase in COMMON_PHRASES:
                audio_bytes = self._run_async(self._generate_audio(phrase))
                if audio_bytes:
                    data, sr = sf.read(io.BytesIO(audio_bytes))
                    self._cache[phrase.lower().strip(".")] = (data, sr)
            print(f"[TTS] Frases de confirmacion en RAM: {len(self._cache)} (0ms latencia)")
        except Exception as e:
            print(f"[TTS] Error pre-cacheando: {e}")

    def speak(self, text: str):
        """Genera y reproduce audio. Usa cache RAM si esta disponible para respuesta instantanea."""
        if not text or not text.strip():
            return

        clean = text.strip()
        print(f"[JARVIS] -> {clean}")

        key = clean.lower().strip(".")
        # 1. Comprobar cache inmediata (0 ms de espera)
        if key in self._cache:
            data, sr = self._cache[key]
            sd.play(data, sr)
            sd.wait()
            return

        if not EDGE_TTS_AVAILABLE:
            return

        # 2. Generar en tiempo real con edge-tts acelerado
        try:
            audio_bytes = self._run_async(self._generate_audio(clean))
            if audio_bytes:
                data, samplerate = sf.read(io.BytesIO(audio_bytes))
                sd.play(data, samplerate)
                sd.wait()
        except Exception as e:
            print(f"[TTS] Error en audio: {e}")

    def _run_async(self, coro):
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result(timeout=6.0)

    async def _generate_audio(self, text: str) -> bytes:
        communicate = edge_tts.Communicate(text, self.voice, rate=self.rate)
        chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)

    def speak_activation(self):
        if WINSOUND_AVAILABLE:
            try:
                winsound.Beep(1200, 70)
                return
            except Exception:
                pass
        print("[JARVIS] *BEEP*")

    def speak_processing(self):
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
