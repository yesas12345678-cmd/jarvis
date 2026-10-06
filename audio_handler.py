"""
audio_handler.py - Modulo de audio para J.A.R.V.I.S.
Soporta doble modo de activacion:
1. Modelo openwakeword local ('hey jarvis')
2. Reconocimiento de palabra clave en lenguaje natural espanol ('jarvis', 'oye jarvis', etc.)
"""

import time
import numpy as np
import threading
import sounddevice as sd
import webrtcvad
import speech_recognition as sr

try:
    from openwakeword.model import Model as OWWModel
    OWW_AVAILABLE = True
except ImportError:
    OWW_AVAILABLE = False

RATE = 16000
CHANNELS = 1
DTYPE = "int16"
SAMPLE_WIDTH = 2

WW_CHUNK_SAMPLES = 1280    # 80ms a 16kHz
WW_THRESHOLD = 0.20        # Umbral sensible para openwakeword

VAD_CHUNK_SAMPLES = 480    # 30ms a 16kHz
VAD_MODE = 1               # Nivel balanceado

SILENCE_TIMEOUT = 0.65     # 0.65 segundos de silencio para responder casi al instante
MAX_RECORD_SECONDS = 7.0   # Maximo 7 segundos por frase


class AudioHandler:
    """Gestor de audio y deteccion de voz ultra-responsivo."""

    def __init__(self):
        self.vad = webrtcvad.Vad(VAD_MODE)
        self.recognizer = sr.Recognizer()
        self.noise_floor = self._calibrate_noise()
        print(f"[AUDIO] Ruido ambiental calibrado: RMS {self.noise_floor:.1f}")

        self.ww_model = self._load_wake_word_model()

    def _calibrate_noise(self) -> float:
        """Calibra el nivel de sonido base en reposo."""
        try:
            samples = int(RATE * 0.3)
            rec = sd.rec(samples, samplerate=RATE, channels=CHANNELS, dtype=DTYPE)
            sd.wait()
            rms = float(np.sqrt(np.mean(rec.astype(np.float32) ** 2)))
            return max(rms, 10.0)
        except Exception:
            return 25.0

    def _load_wake_word_model(self):
        if not OWW_AVAILABLE:
            return None
        try:
            model = OWWModel(wakeword_models=["hey_jarvis_v0.1.onnx"], inference_framework="onnx")
            return model
        except Exception as e:
            print(f"[AUDIO] Fallback a deteccion VAD por voz: {e}")
            return None

    def listen_and_capture(self) -> tuple[str | None, str | None]:
        """
        Escucha de forma continua hasta que el usuario hable.
        Detecta si se menciono 'Jarvis' (o si el modelo local se activo).
        
        Retorna:
            (wake_word_tipo, comando_extra)
            Ejemplo 1: ("hey_jarvis", "abre la calculadora")  -> si dijo "Jarvis abre la calculadora"
            Ejemplo 2: ("hey_jarvis", "")                     -> si solo dijo "Jarvis" o "Hey Jarvis"
            Ejemplo 3: (None, None)                           -> si hablo pero no dijo Jarvis
        """
        frames = []
        speech_started = False
        silence_frames = 0
        silence_limit = int(SILENCE_TIMEOUT * RATE / VAD_CHUNK_SAMPLES)
        start_time = time.time()
        stop_event = threading.Event()
        speech_threshold = max(self.noise_floor * 1.8, 35.0)

        def callback(indata, frame_count, time_info, status):
            nonlocal speech_started, silence_frames
            if stop_event.is_set():
                return

            chunk = indata[:, 0].astype(np.int16)
            raw = chunk.tobytes()
            frames.append(raw)

            # Detectar voz
            is_speech = False
            if len(raw) == VAD_CHUNK_SAMPLES * SAMPLE_WIDTH:
                try:
                    is_speech = self.vad.is_speech(raw, RATE)
                except Exception:
                    pass

            if not is_speech:
                rms = float(np.sqrt(np.mean(chunk.astype(np.float32) ** 2)))
                is_speech = (rms >= speech_threshold)

            if is_speech:
                if not speech_started:
                    print(".", end="", flush=True)
                speech_started = True
                silence_frames = 0
            elif speech_started:
                silence_frames += 1

            elapsed = time.time() - start_time

            # Detener cuando termine de hablar o se agote el tiempo
            if speech_started and silence_frames >= silence_limit:
                stop_event.set()
                return
            if speech_started and elapsed >= MAX_RECORD_SECONDS:
                stop_event.set()
                return

        try:
            with sd.InputStream(
                samplerate=RATE,
                channels=CHANNELS,
                dtype=DTYPE,
                blocksize=VAD_CHUNK_SAMPLES,
                callback=callback,
            ):
                while not stop_event.is_set():
                    time.sleep(0.04)
        except Exception as e:
            print(f"[AUDIO] Stream: {e}")

        if not speech_started or not frames:
            return None, None

        audio_bytes = b"".join(frames)

        # Transcribir la frase hablada
        text = self.transcribe(audio_bytes)
        if not text:
            return None, None

        lower = text.lower()
        print(f"\n[AUDIO] Frase captada: \"{text}\"")

        # Comprobar si menciono a Jarvis (o variantes foneticas habituales)
        keywords = ["jarvis", "yarvis", "jarvi", "charvis", "harvis"]
        for kw in keywords:
            if kw in lower:
                # Separar el comando si vino todo en una sola frase
                parts = lower.split(kw, 1)
                remainder = parts[1].strip() if len(parts) > 1 else ""
                # Limpiar caracteres tipicos al inicio del comando
                remainder = remainder.lstrip(",.:;!?- ")
                return "jarvis_detected", remainder

        return None, None

    def record_followup(self) -> str | None:
        """Graba la orden si el usuario solo dijo 'Jarvis' y necesita darle la instruccion."""
        frames = []
        speech_started = False
        silence_frames = 0
        silence_limit = int(SILENCE_TIMEOUT * RATE / VAD_CHUNK_SAMPLES)
        start_time = time.time()
        stop_event = threading.Event()
        speech_threshold = max(self.noise_floor * 1.8, 35.0)

        def callback(indata, frame_count, time_info, status):
            nonlocal speech_started, silence_frames
            if stop_event.is_set():
                return

            chunk = indata[:, 0].astype(np.int16)
            raw = chunk.tobytes()
            frames.append(raw)

            is_speech = False
            if len(raw) == VAD_CHUNK_SAMPLES * SAMPLE_WIDTH:
                try:
                    is_speech = self.vad.is_speech(raw, RATE)
                except Exception:
                    pass

            if not is_speech:
                rms = float(np.sqrt(np.mean(chunk.astype(np.float32) ** 2)))
                is_speech = (rms >= speech_threshold)

            if is_speech:
                speech_started = True
                silence_frames = 0
            elif speech_started:
                silence_frames += 1

            elapsed = time.time() - start_time
            if speech_started and silence_frames >= silence_limit:
                stop_event.set()
                return
            if elapsed >= 8.0:
                stop_event.set()
                return

        try:
            with sd.InputStream(
                samplerate=RATE,
                channels=CHANNELS,
                dtype=DTYPE,
                blocksize=VAD_CHUNK_SAMPLES,
                callback=callback,
            ):
                stop_event.wait(timeout=9.0)
        except Exception:
            pass

        if not speech_started or not frames:
            return None

        return self.transcribe(b"".join(frames))

    def transcribe(self, audio_bytes: bytes) -> str | None:
        """Convierte los bytes de audio en texto con Google SpeechRecognition."""
        try:
            audio_data = sr.AudioData(audio_bytes, RATE, SAMPLE_WIDTH)
            text = self.recognizer.recognize_google(audio_data, language="es-ES")
            return text
        except (sr.UnknownValueError, sr.RequestError):
            return None
        except Exception:
            return None

    def close(self):
        pass
