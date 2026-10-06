"""
tts_handler.py - Sintesis de voz para J.A.R.V.I.S.
Usa edge-tts para generar audio y PowerShell WMP para reproducirlo (sin compilacion).
Compatible con Python 3.14+.
"""

import asyncio
import os
import tempfile
import time
import subprocess

try:
    import edge_tts
    EDGE_TTS_AVAILABLE = True
except ImportError:
    EDGE_TTS_AVAILABLE = False
    print("[TTS] edge-tts no disponible. Instala con: pip install edge-tts")

try:
    import winsound
    WINSOUND_AVAILABLE = True
except ImportError:
    WINSOUND_AVAILABLE = False

DEFAULT_VOICE = os.environ.get("JARVIS_VOICE", "es-ES-AlvaroNeural")

# Script PowerShell para reproducir MP3 con Windows Media Foundation
_PS_PLAY_MP3 = """
Add-Type -AssemblyName PresentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([System.Uri]::new((Resolve-Path "{path}").Path))
$player.Play()
$duration = 0
while ($player.NaturalDuration.HasTimeSpan -eq $false) {{ Start-Sleep -Milliseconds 100; $duration += 100; if ($duration -ge 3000) {{ break }} }}
if ($player.NaturalDuration.HasTimeSpan) {{ Start-Sleep -Seconds $player.NaturalDuration.TimeSpan.TotalSeconds }}
else {{ Start-Sleep -Seconds 5 }}
$player.Close()
"""


class TTSHandler:
    """
    Gestor de Text-to-Speech para JARVIS.
    Genera audio con edge-tts y lo reproduce con Windows Media Foundation.
    """

    def __init__(self, voice: str = DEFAULT_VOICE):
        self.voice = voice
        print(f"[TTS] Voz configurada: {self.voice}")

    def speak(self, text: str):
        """Convierte texto a voz y lo reproduce de forma bloqueante."""
        if not text or not text.strip():
            return

        print(f"[JARVIS] -> {text}")

        if not EDGE_TTS_AVAILABLE:
            print("[TTS] edge-tts no disponible. Respuesta solo en consola.")
            return

        try:
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
        """Guarda bytes de MP3 en archivo temporal y lo reproduce con PowerShell + WMF."""
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name

            ps_script = _PS_PLAY_MP3.format(path=tmp_path.replace("\\", "\\\\"))
            subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_script],
                timeout=60,
                capture_output=True,
            )

        except subprocess.TimeoutExpired:
            print("[TTS] Timeout reproduciendo audio.")
        except Exception as e:
            print(f"[TTS] Error reproduciendo audio: {e}")
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass

    def speak_activation(self):
        """Reproduce un doble beep de activacion cuando se detecta el wake word."""
        if WINSOUND_AVAILABLE:
            try:
                winsound.Beep(880, 120)
                time.sleep(0.05)
                winsound.Beep(1320, 120)
                return
            except Exception:
                pass
        print("[JARVIS] *BEEP BEEP* - Escuchando...")

    def close(self):
        """Libera recursos."""
        pass
