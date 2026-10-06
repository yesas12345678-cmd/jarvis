"""
audio_handler.py - Modulo de audio para J.A.R.V.I.S.
Usa sounddevice (compatible Python 3.14+) para entrada de microfono.
Wake word: openwakeword ('hey_jarvis_v0.1.onnx')
VAD: webrtcvad + calibracion de energia dinamica
STT: Google SpeechRecognition
"""

import time
import numpy as np
import threading

try:
    import sounddevice as sd
    SD_AVAILABLE = True
except ImportError:
    SD_AVAILABLE = False
    print("[AUDIO] sounddevice no disponible.")

try:
    import webrtcvad
    WEBRTCVAD_AVAILABLE = True
except ImportError:
    WEBRTCVAD_AVAILABLE = False
    print("[AUDIO] webrtcvad no disponible.")

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
    print("[AUDIO] openwakeword no disponible.")

# ---------------------------------------------------------------
# Constantes de audio
# ---------------------------------------------------------------
RATE = 16000
CHANNELS = 1
DTYPE = "int16"
SAMPLE_WIDTH = 2  # bytes por muestra int16

WW_CHUNK_SAMPLES = 1280    # 80ms a 16kHz (requerido por openwakeword)
WW_THRESHOLD = 0.20        # Calibrado para pronunciacion en espanol de 'Hey Jarvis'

VAD_CHUNK_SAMPLES = 480    # 30ms a 16kHz (requerido por webrtcvad)
VAD_MODE = 1               # Modo 1: balanceado para captura de voz de escritorio

SILENCE_TIMEOUT = 1.8      # Segundos de silencio para finalizar grabacion
MAX_RECORD_SECONDS = 25    # Duracion maxima de un comando
PRE_SPEECH_TIMEOUT = 7.0   # Tiempo maximo de espera antes de que empiece a hablar


class AudioHandler:
    """Gestor de audio y deteccion de voz de JARVIS."""

    def __init__(self):
        if not SD_AVAILABLE:
            raise RuntimeError("sounddevice es requerido. Instala: pip install sounddevice")

        if WEBRTCVAD_AVAILABLE:
            self.vad = webrtcvad.Vad(VAD_MODE)
        else:
            self.vad = None

        if SR_AVAILABLE:
            self.recognizer = sr.Recognizer()
        else:
            self.recognizer = None

        # Nivel base de ruido ambiental
        self.noise_floor = self._calibrate_noise()
        print(f"[AUDIO] Calibracion de ruido ambiental: RMS {self.noise_floor:.1f}")

        # Cargar modelo local de wake word
        self.ww_model = self._load_wake_word_model()

    def _calibrate_noise(self) -> float:
        """Mide 0.4 segundos de sonido ambiental para establecer el umbral base."""
        try:
            samples = int(RATE * 0.4)
            recording = sd.rec(samples, samplerate=RATE, channels=CHANNELS, dtype=DTYPE)
            sd.wait()
            rms = float(np.sqrt(np.mean(recording.astype(np.float32) ** 2)))
            return max(rms, 10.0)
        except Exception as e:
            print(f"[AUDIO] Error al calibrar ruido: {e}")
            return 25.0

    def _load_wake_word_model(self):
        if not OWW_AVAILABLE:
            return None
        try:
            print("[AUDIO] Cargando modelo de wake word 'hey jarvis'...")
            model = OWWModel(wakeword_models=["hey_jarvis_v0.1.onnx"], inference_framework="onnx")
            wakewords = list(model.models.keys())
            print(f"[AUDIO] Modelo cargado: {wakewords} (umbral: {WW_THRESHOLD})")
            return model
        except Exception as e:
            print(f"[AUDIO] Error cargando modelo de wake word: {e}")
            return None

    # --------------------------------------------------------
    # 1. DETECCION DE WAKE WORD
    # --------------------------------------------------------
    def listen_for_wake_word(self) -> bool:
        """
        Escucha pasivamente en segundo plano hasta detectar 'Hey Jarvis'.
        Si no esta disponible el modelo, espera Enter.
        """
        if self.ww_model is None:
            input("\n[JARVIS] Presiona Enter para activar: ")
            return True

        detected = False
        last_log_time = time.time()

        def callback(indata, frames, time_info, status):
            nonlocal detected, last_log_time
            if detected:
                return

            audio_arr = indata[:, 0].copy()
            if len(audio_arr) == WW_CHUNK_SAMPLES:
                try:
                    predictions = self.ww_model.predict(audio_arr)
                    for name, score in predictions.items():
                        # Log periodico si hay alguna similitud
                        if score >= 0.12 and (time.time() - last_log_time) > 0.5:
                            print(f"[AUDIO] Senal detectada: {score:.2f}")
                            last_log_time = time.time()

                        if score >= WW_THRESHOLD:
                            print(f"\n[AUDIO] >>> ACTIVADO: '{name}' (confianza: {score:.2f}) <<<")
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
                    time.sleep(0.04)
        except Exception as e:
            print(f"[AUDIO] Error en wake word stream: {e}")
            return False

        return True

    # --------------------------------------------------------
    # 2. GRABACION CON VAD
    # --------------------------------------------------------
    def record_command(self) -> bytes | None:
        """
        Graba el microfono de forma dinamica hasta detectar silencio.
        Retorna los bytes PCM grabados o None si no hubo voz.
        """
        frames = []
        speech_detected = False
        silence_frames = 0
        silence_limit = int(SILENCE_TIMEOUT * RATE / VAD_CHUNK_SAMPLES)
        start = time.time()
        stop_event = threading.Event()
        speech_threshold_rms = max(self.noise_floor * 1.8, 35.0)

        def callback(indata, frame_count, time_info, status):
            nonlocal speech_detected, silence_frames
            if stop_event.is_set():
                raise sd.CallbackStop()

            chunk = indata[:, 0].astype(np.int16)
            raw = chunk.tobytes()
            frames.append(raw)

            # Deteccion hibrida: VAD + Energia adaptativa
            is_speech = False
            if self.vad and len(raw) == VAD_CHUNK_SAMPLES * SAMPLE_WIDTH:
                try:
                    is_speech = self.vad.is_speech(raw, RATE)
                except Exception:
                    pass

            if not is_speech:
                rms = np.sqrt(np.mean(chunk.astype(np.float32) ** 2))
                is_speech = (rms >= speech_threshold_rms)

            if is_speech:
                if not speech_detected:
                    print("[AUDIO] Voz detectada... grabando.")
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
            print("[AUDIO] No se detecto voz dentro del tiempo limite.")
            return None

        total_duration = time.time() - start
        print(f"[AUDIO] Audio capturado ({total_duration:.1f}s). Procesando...")
        return b"".join(frames)

    # --------------------------------------------------------
    # 3. TRANSCRIPCION STT
    # --------------------------------------------------------
    def transcribe(self, audio_bytes: bytes) -> str | None:
        """Convierte los bytes de audio en texto con Google SpeechRecognition."""
        if not SR_AVAILABLE or self.recognizer is None:
            print("[AUDIO] SpeechRecognition no disponible.")
            return None

        audio_data = sr.AudioData(audio_bytes, RATE, SAMPLE_WIDTH)
        try:
            text = self.recognizer.recognize_google(audio_data, language="es-ES")
            print(f"[AUDIO] Transcrito: \"{text}\"")
            return text
        except sr.UnknownValueError:
            print("[AUDIO] No se pudo interpretar el audio (voz baja o ruido).")
            return None
        except sr.RequestError as e:
            print(f"[AUDIO] Error de conexion con servicio STT: {e}")
            return None
        except Exception as e:
            print(f"[AUDIO] Error STT: {e}")
            return None

    def close(self):
        pass
