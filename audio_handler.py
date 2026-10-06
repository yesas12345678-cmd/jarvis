"""
audio_handler.py - Modulo de audio para J.A.R.V.I.S.
Usa sounddevice (compatible Python 3.14+) en lugar de pyaudio.
Wake word: openwakeword | VAD: webrtcvad | STT: SpeechRecognition
"""

import time
import numpy as np
import threading
import queue

try:
    import sounddevice as sd
    SD_AVAILABLE = True
except ImportError:
    SD_AVAILABLE = False
    print("[AUDIO] sounddevice no disponible. Instala: pip install sounddevice")

try:
    import webrtcvad
    WEBRTCVAD_AVAILABLE = True
except ImportError:
    WEBRTCVAD_AVAILABLE = False
    print("[AUDIO] webrtcvad no disponible. Se usara deteccion por energia.")

try:
    import speech_recognition as sr
    SR_AVAILABLE = True
except ImportError:
    SR_AVAILABLE = False
    print("[AUDIO] SpeechRecognition no disponible.")

try:
    from openwakeword.model import Model as OWWModel
    OWW_AVAILABLE = True
except ImportError:
    OWW_AVAILABLE = False
    print("[AUDIO] openwakeword no disponible. Usando modo fallback (tecla Enter).")

# ---------------------------------------------------------------
# Constantes de audio
# ---------------------------------------------------------------
RATE = 16000
CHANNELS = 1
DTYPE = "int16"
SAMPLE_WIDTH = 2  # bytes por muestra int16

WW_CHUNK_SAMPLES = 1280   # 80ms a 16kHz (requerido por openwakeword)
WW_THRESHOLD = 0.35

VAD_CHUNK_SAMPLES = 480   # 30ms a 16kHz (requerido por webrtcvad)
VAD_MODE = 3

SILENCE_TIMEOUT = 1.5
MAX_RECORD_SECONDS = 30
PRE_SPEECH_TIMEOUT = 5.0


class AudioHandler:
    """Gestor de audio de JARVIS usando sounddevice."""

    def __init__(self):
        if not SD_AVAILABLE:
            raise RuntimeError("sounddevice es necesario. Instala: pip install sounddevice")

        if WEBRTCVAD_AVAILABLE:
            self.vad = webrtcvad.Vad(VAD_MODE)
        else:
            self.vad = None

        if SR_AVAILABLE:
            self.recognizer = sr.Recognizer()
        else:
            self.recognizer = None

        self.ww_model = self._load_wake_word_model()

    def _load_wake_word_model(self):
        if not OWW_AVAILABLE:
            return None
        try:
            print("[AUDIO] Cargando modelo de wake word 'hey jarvis'...")
            model = OWWModel(wakeword_models=["hey_jarvis_v0.1.onnx"], inference_framework="onnx")
            wakewords = list(model.models.keys())
            print(f"[AUDIO] Wake words activos: {wakewords}")
            return model
        except Exception as e:
            print(f"[AUDIO] Error cargando wake word model: {e}")
            return None

    # --------------------------------------------------------
    # 1. DETECCION DE WAKE WORD
    # --------------------------------------------------------
    def listen_for_wake_word(self) -> bool:
        """Escucha pasivamente hasta detectar el wake word. Fallback: Enter."""
        if self.ww_model is None:
            input("\n[JARVIS] Presiona Enter para activar (wake word no disponible): ")
            return True

        detected = False

        def callback(indata, frames, time_info, status):
            nonlocal detected
            if detected:
                return
            audio_arr = indata[:, 0].copy()
            if len(audio_arr) == WW_CHUNK_SAMPLES:
                try:
                    predictions = self.ww_model.predict(audio_arr)
                    for name, score in predictions.items():
                        if score >= WW_THRESHOLD:
                            print(f"\n[AUDIO] ¡Wake word detectado! '{name}' (confianza: {score:.2f})")
                            detected = True
                except Exception as ex:
                    print(f"[AUDIO] Error en predict: {ex}")

        try:
            with sd.InputStream(
                samplerate=RATE,
                channels=CHANNELS,
                dtype=DTYPE,
                blocksize=WW_CHUNK_SAMPLES,
                callback=callback,
            ):
                while not detected:
                    time.sleep(0.05)
        except Exception as e:
            print(f"[AUDIO] Error en wake word stream: {e}")
            return False

        return True

    # --------------------------------------------------------
    # 2. GRABACION CON VAD
    # --------------------------------------------------------
    def record_command(self) -> bytes | None:
        """Graba hasta detectar silencio con VAD. Retorna PCM bytes o None."""
        frames = []
        speech_detected = False
        silence_frames = 0
        silence_limit = int(SILENCE_TIMEOUT * RATE / VAD_CHUNK_SAMPLES)
        start = time.time()
        stop_event = threading.Event()

        def callback(indata, frame_count, time_info, status):
            nonlocal speech_detected, silence_frames
            if stop_event.is_set():
                raise sd.CallbackStop()

            chunk = indata[:, 0].astype(np.int16)
            raw = chunk.tobytes()
            frames.append(raw)

            # VAD
            if self.vad and len(raw) == VAD_CHUNK_SAMPLES * SAMPLE_WIDTH:
                try:
                    is_speech = self.vad.is_speech(raw, RATE)
                except Exception:
                    is_speech = self._energy_speech(chunk)
            else:
                is_speech = self._energy_speech(chunk)

            if is_speech:
                speech_detected = True
                silence_frames = 0
            elif speech_detected:
                silence_frames += 1

            elapsed = time.time() - start

            if speech_detected and silence_frames >= silence_limit:
                stop_event.set()
                raise sd.CallbackStop()
            if elapsed >= MAX_RECORD_SECONDS:
                stop_event.set()
                raise sd.CallbackStop()
            if not speech_detected and elapsed >= PRE_SPEECH_TIMEOUT:
                stop_event.set()
                raise sd.CallbackStop()

        try:
            with sd.InputStream(
                samplerate=RATE,
                channels=CHANNELS,
                dtype=DTYPE,
                blocksize=VAD_CHUNK_SAMPLES,
                callback=callback,
            ):
                stop_event.wait(timeout=MAX_RECORD_SECONDS + 2)
        except Exception as e:
            if "CallbackStop" not in str(type(e).__name__):
                print(f"[AUDIO] Error en grabacion: {e}")

        if not speech_detected:
            print("[AUDIO] Sin voz detectada. Timeout.")
            return None

        print(f"[AUDIO] Grabacion completa ({time.time()-start:.1f}s).")
        return b"".join(frames)

    def _energy_speech(self, chunk: np.ndarray) -> bool:
        """Deteccion de voz por RMS (fallback sin webrtcvad)."""
        rms = np.sqrt(np.mean(chunk.astype(np.float32) ** 2))
        return rms > 600

    # --------------------------------------------------------
    # 3. TRANSCRIPCION STT
    # --------------------------------------------------------
    def transcribe(self, audio_bytes: bytes) -> str | None:
        """Transcribe bytes PCM a texto con Google Speech Recognition."""
        if not SR_AVAILABLE or self.recognizer is None:
            print("[AUDIO] SpeechRecognition no disponible.")
            return None

        audio_data = sr.AudioData(audio_bytes, RATE, SAMPLE_WIDTH)
        try:
            text = self.recognizer.recognize_google(audio_data, language="es-ES")
            print(f"[AUDIO] Transcripcion: '{text}'")
            return text
        except sr.UnknownValueError:
            print("[AUDIO] No se pudo entender el audio.")
            return None
        except sr.RequestError as e:
            print(f"[AUDIO] Error en servicio STT: {e}")
            return None
        except Exception as e:
            print(f"[AUDIO] Error inesperado: {e}")
            return None

    def close(self):
        pass
