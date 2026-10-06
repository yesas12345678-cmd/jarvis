"""
audio_handler.py - Modulo de audio para J.A.R.V.I.S.
Gestiona: deteccion de wake word (openwakeword), grabacion con VAD (webrtcvad) y STT.
"""

import time
import numpy as np

try:
    import pyaudio
    PYAUDIO_AVAILABLE = True
except ImportError:
    PYAUDIO_AVAILABLE = False
    print("[AUDIO] pyaudio no disponible.")

try:
    import webrtcvad
    WEBRTCVAD_AVAILABLE = True
except ImportError:
    WEBRTCVAD_AVAILABLE = False
    print("[AUDIO] webrtcvad no disponible. La deteccion de silencio sera basica.")

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
RATE = 16000          # Sample rate requerido por openwakeword y webrtcvad
CHANNELS = 1
FORMAT_INT = None     # Se asigna dinamicamente con pyaudio
SAMPLE_WIDTH = 2      # bytes por muestra (int16)

WW_CHUNK = 1280       # 80ms a 16kHz (requerido por openwakeword)
WW_THRESHOLD = 0.5    # Score minimo para activar wake word

VAD_CHUNK = 480       # 30ms a 16kHz (requerido por webrtcvad)
VAD_MODE = 3          # Agresividad maxima (0-3)

SILENCE_TIMEOUT = 1.5       # Segundos de silencio para detener grabacion
MAX_RECORD_SECONDS = 30     # Duracion maxima de un comando
PRE_SPEECH_TIMEOUT = 5.0    # Espera maxima antes de que empiece a hablar


class AudioHandler:
    """Gestor completo del pipeline de audio de JARVIS."""

    def __init__(self):
        global FORMAT_INT

        if not PYAUDIO_AVAILABLE:
            print("[AUDIO][ERROR] pyaudio es necesario. Instala con: pip install pyaudio")
            self.pa = None
            return

        self.pa = pyaudio.PyAudio()
        FORMAT_INT = pyaudio.paInt16

        # VAD
        if WEBRTCVAD_AVAILABLE:
            self.vad = webrtcvad.Vad(VAD_MODE)
        else:
            self.vad = None

        # Speech Recognition
        if SR_AVAILABLE:
            self.recognizer = sr.Recognizer()
        else:
            self.recognizer = None

        # Wake Word Model
        self.ww_model = self._load_wake_word_model()

    def _load_wake_word_model(self):
        """Carga el modelo de wake word con manejo de errores."""
        if not OWW_AVAILABLE:
            return None
        try:
            print("[AUDIO] Cargando modelo de wake word (primera vez descarga ~50MB)...")
            model = OWWModel(inference_framework="onnx")
            wakewords = list(model.models.keys())
            print(f"[AUDIO] Wake words disponibles: {wakewords}")
            return model
        except Exception as e:
            print(f"[AUDIO] Error al cargar wake word model: {e}")
            return None

    # --------------------------------------------------------
    # 1. DETECCION DE WAKE WORD
    # --------------------------------------------------------
    def listen_for_wake_word(self) -> bool:
        """
        Escucha pasivamente hasta detectar el wake word ('hey jarvis').
        Fallback: espera que el usuario presione Enter.
        Retorna True cuando se detecta activacion.
        """
        if self.ww_model is None or self.pa is None:
            input("\n[JARVIS] (Modo texto) Presiona Enter para activar JARVIS: ")
            return True

        stream = self.pa.open(
            format=FORMAT_INT,
            channels=CHANNELS,
            rate=RATE,
            input=True,
            frames_per_buffer=WW_CHUNK,
        )

        try:
            while True:
                raw = stream.read(WW_CHUNK, exception_on_overflow=False)
                audio_arr = (
                    np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
                )

                predictions = self.ww_model.predict(audio_arr)

                for name, score in predictions.items():
                    if score >= WW_THRESHOLD:
                        print(f"[AUDIO] Wake word detectado! '{name}' (score: {score:.2f})")
                        return True

        except OSError as e:
            print(f"[AUDIO] Error de stream en wake word: {e}")
            return False
        finally:
            stream.stop_stream()
            stream.close()

    # --------------------------------------------------------
    # 2. GRABACION CON VAD
    # --------------------------------------------------------
    def record_command(self) -> bytes | None:
        """
        Graba el microfono hasta detectar silencio usando VAD.
        Retorna bytes PCM (16kHz, 16-bit mono) o None si no hay voz.
        """
        if self.pa is None:
            return None

        stream = self.pa.open(
            format=FORMAT_INT,
            channels=CHANNELS,
            rate=RATE,
            input=True,
            frames_per_buffer=VAD_CHUNK,
        )

        frames = []
        speech_detected = False
        silence_frames = 0
        silence_limit = int(SILENCE_TIMEOUT * RATE / VAD_CHUNK)
        start = time.time()

        try:
            while True:
                frame = stream.read(VAD_CHUNK, exception_on_overflow=False)

                # Deteccion de voz
                if self.vad:
                    try:
                        is_speech = self.vad.is_speech(frame, RATE)
                    except Exception:
                        is_speech = self._energy_based_speech(frame)
                else:
                    is_speech = self._energy_based_speech(frame)

                frames.append(frame)

                if is_speech:
                    speech_detected = True
                    silence_frames = 0
                elif speech_detected:
                    silence_frames += 1

                elapsed = time.time() - start

                # Condiciones de parada
                if speech_detected and silence_frames >= silence_limit:
                    print(f"[AUDIO] Grabacion completa ({elapsed:.1f}s de audio).")
                    break
                if elapsed >= MAX_RECORD_SECONDS:
                    print("[AUDIO] Tiempo maximo de grabacion alcanzado.")
                    break
                if not speech_detected and elapsed >= PRE_SPEECH_TIMEOUT:
                    print("[AUDIO] Sin voz detectada. Timeout.")
                    return None

        except OSError as e:
            print(f"[AUDIO] Error de stream en grabacion: {e}")
        finally:
            stream.stop_stream()
            stream.close()

        if not speech_detected:
            return None

        return b"".join(frames)

    def _energy_based_speech(self, frame: bytes) -> bool:
        """Deteccion de voz basada en energia de audio (fallback sin webrtcvad)."""
        audio = np.frombuffer(frame, dtype=np.int16).astype(np.float32)
        rms = np.sqrt(np.mean(audio ** 2))
        return rms > 500  # Umbral ajustable

    # --------------------------------------------------------
    # 3. TRANSCRIPCION (STT)
    # --------------------------------------------------------
    def transcribe(self, audio_bytes: bytes) -> str | None:
        """
        Transcribe bytes de audio PCM a texto usando Google Speech Recognition.
        Intenta espanol primero, luego ingles como fallback.
        """
        if not SR_AVAILABLE or self.recognizer is None:
            print("[AUDIO] SpeechRecognition no disponible.")
            return None

        audio_data = sr.AudioData(audio_bytes, RATE, SAMPLE_WIDTH)

        # Intentar espanol
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
            print(f"[AUDIO] Error inesperado en transcripcion: {e}")
            return None

    # --------------------------------------------------------
    # LIMPIEZA
    # --------------------------------------------------------
    def close(self):
        """Libera los recursos de PyAudio."""
        try:
            if self.pa:
                self.pa.terminate()
        except Exception:
            pass
