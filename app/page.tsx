"use client";

import React, { useState, useEffect, useRef } from "react";
import { HolographicCore } from "@/components/HolographicCore";
import { StatusReadout } from "@/components/StatusReadout";
import { ActionModal } from "@/components/ActionModal";
import {
  USER_NAME,
  ASSISTANT_NAME,
  ASSISTANT_PRONUNCIATION,
  LANGUAGE,
  AssistantState,
  ActionPayload,
} from "@/lib/constants";
import { Mic, MicOff, Send, Volume2, ShieldCheck, Sparkles, Terminal, RotateCcw } from "lucide-react";

export default function AssistantPage() {
  const [state, setState] = useState<AssistantState>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [lastReply, setLastReply] = useState<string>("");
  const [readoutText, setReadoutText] = useState<string>("SISTEMAS SINCRONIZADOS");
  const [inputText, setInputText] = useState<string>("");
  const [activeAction, setActiveAction] = useState<ActionPayload | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Cargar memoria previa desde almacenamiento local
  useEffect(() => {
    try {
      const saved = localStorage.getItem("jude_memory");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      }
    } catch {}
  }, []);

  const saveHistory = (newHistory: Array<{ role: "user" | "assistant"; content: string }>) => {
    setHistory(newHistory);
    try {
      localStorage.setItem("jude_memory", JSON.stringify(newHistory.slice(-20)));
    } catch {}
  };

  const clearMemory = () => {
    setHistory([]);
    try {
      localStorage.removeItem("jude_memory");
    } catch {}
    setReadoutText("MEMORIA REINICIADA // TABULA RASA");
  };

  // Inicializar Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = LANGUAGE;

      recognition.onstart = () => {
        setIsRecording(true);
        setState("listening");
        setReadoutText("CAPTURA DE AUDIO ACTIVA");
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (err: any) => {
        console.warn("[SPEECH_RECOGNITION_ERROR]", err);
        stopAudioAnalysis();
        setIsRecording(false);
        setState("idle");
        setReadoutText("LISTO // ESPERANDO COMANDO");
      };

      recognition.onend = () => {
        setIsRecording(false);
        stopAudioAnalysis();
      };

      recognitionRef.current = recognition;
    }

    return () => {
      stopAudioAnalysis();
    };
  }, []);

  // Iniciar análisis de amplitud del micrófono
  const startAudioAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength / 255;
        setAudioLevel(avg);
        animationFrameRef.current = requestAnimationFrame(checkLevel);
      };

      checkLevel();
    } catch (err) {
      console.warn("[AUDIO_CAPTURE_DISABLED_OR_DENIED]", err);
    }
  };

  const stopAudioAnalysis = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  };

  // Push to talk handlers
  const handleStartPushToTalk = () => {
    if (state === "processing" || state === "speaking") return;
    setTranscript("");
    startAudioAnalysis();
    try {
      recognitionRef.current?.start();
    } catch {
      // Ignorar si ya estaba iniciado
    }
  };

  const handleStopPushToTalk = () => {
    if (!isRecording) return;
    try {
      recognitionRef.current?.stop();
    } catch {}
    stopAudioAnalysis();

    if (transcript.trim()) {
      executeCommand(transcript.trim());
    } else {
      setState("idle");
    }
  };

  // Procesar comando con el cerebro de Jude
  const executeCommand = async (command: string) => {
    setState("processing");
    setReadoutText("PROCESANDO INTENCIÓN");

    // Agregar turno de usuario
    const updatedHistory = [...history, { role: "user" as const, content: command }];
    saveHistory(updatedHistory);

    try {
      const response = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: command, history: updatedHistory }),
      });

      const data = await response.json();
      const replyText = data.speech || `A tu orden, ${USER_NAME}.`;
      setLastReply(replyText);
      setReadoutText(data.readout || "RESPUESTA SINTETIZADA");

      // Guardar turno del asistente en la memoria
      saveHistory([...updatedHistory, { role: "assistant" as const, content: replyText }]);

      // Si hay acción asociada (email o calendar)
      if (data.action && data.action.type !== "none") {
        setActiveAction(data.action);
      }

      // Reproducir voz
      await speakResponse(replyText);
    } catch (error) {
      console.error("[EXECUTE_COMMAND_ERROR]", error);
      const fallbackMsg = `Comprendido, ${USER_NAME}.`;
      setLastReply(fallbackMsg);
      await speakResponse(fallbackMsg);
    }
  };

  // Síntesis de voz (ElevenLabs con fallback a navegador)
  const speakResponse = async (text: string) => {
    setState("speaking");
    setReadoutText("SÍNTESIS ELEVENLABS EN CURSO");

    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);

        audio.onplay = () => {
          setAudioLevel(0.65);
        };
        audio.onended = () => {
          setState("idle");
          setAudioLevel(0);
          setReadoutText("STANDBY // NÚCLEO LISTO");
          URL.revokeObjectURL(audioUrl);
        };
        audio.onerror = () => {
          playNativeBrowserSpeech(text);
        };

        await audio.play();
        return;
      }
    } catch (ttsErr) {
      console.warn("[TTS_FALLBACK]", ttsErr);
    }

    // Fallback nativo
    playNativeBrowserSpeech(text);
  };

  const playNativeBrowserSpeech = (text: string) => {
    if (!("speechSynthesis" in window)) {
      setState("idle");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANGUAGE;
    utterance.rate = 1.05;
    utterance.onstart = () => setAudioLevel(0.5);
    utterance.onend = () => {
      setState("idle");
      setAudioLevel(0);
      setReadoutText("STANDBY // NÚCLEO LISTO");
    };
    utterance.onerror = () => {
      setState("idle");
      setAudioLevel(0);
    };
    window.speechSynthesis.speak(utterance);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const msg = inputText.trim();
    setInputText("");
    setTranscript(msg);
    executeCommand(msg);
  };

  return (
    <main className="hologram-grid min-h-screen flex flex-col justify-between p-4 sm:p-6 md:p-8 max-w-6xl mx-auto selection:bg-core-amber selection:text-black">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-core-amber/20 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-core-amber animate-pulse" />
          <h1 className="font-display font-bold text-xl sm:text-2xl tracking-wider text-white">
            {ASSISTANT_NAME}{" "}
            <span className="text-xs font-mono text-core-amber font-normal">
              [{ASSISTANT_PRONUNCIATION}]
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <button
            onClick={clearMemory}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-panel border border-core-amber/20 hover:border-core-amber/50 text-neutral-300 hover:text-white transition-colors"
            title="Reiniciar contexto de memoria"
          >
            <RotateCcw className="w-3 h-3 text-core-amber" />
            <span>MEMORIA: <strong className="text-core-light">{history.length}</strong> {history.length === 1 ? "TURNO" : "TURNOS"}</span>
          </button>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-panel border border-core-amber/20 text-neutral-300">
            <ShieldCheck className="w-3.5 h-3.5 text-core-amber" />
            <span>USUARIO: <strong className="text-white">{USER_NAME}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-core-amber/10 border border-core-amber/30 text-core-amber">
            <Sparkles className="w-3 h-3" />
            <span className="text-[10px] tracking-widest font-semibold uppercase">Holograma Cuántico</span>
          </div>
        </div>
      </header>

      {/* Center Holographic Stage */}
      <section className="flex-1 flex flex-col items-center justify-center my-4 sm:my-8 relative">
        <HolographicCore
          state={state}
          audioLevel={audioLevel}
          onClick={() => {
            if (isRecording) {
              handleStopPushToTalk();
            } else {
              handleStartPushToTalk();
            }
          }}
        />

        {/* Push to talk interactive button */}
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            onMouseDown={handleStartPushToTalk}
            onMouseUp={handleStopPushToTalk}
            onTouchStart={handleStartPushToTalk}
            onTouchEnd={handleStopPushToTalk}
            className={`flex items-center gap-2.5 px-6 py-3 rounded-full font-mono text-xs font-semibold tracking-wider transition-all duration-300 shadow-hologram select-none active:scale-95 ${
              isRecording
                ? "bg-core-spark text-white ring-4 ring-core-spark/30 animate-pulse"
                : "bg-core-amber hover:bg-core-amber/90 text-black"
            }`}
          >
            {isRecording ? (
              <>
                <MicOff className="w-4 h-4" />
                SOLTAR PARA ENVIAR
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                MANTÉN PRESIONADO PARA HABLAR
              </>
            )}
          </button>
          <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
            O haz clic para alternar micrófono
          </span>
        </div>
      </section>

      {/* Bottom Telemetry & Input Panel */}
      <footer className="flex flex-col gap-4">
        <StatusReadout
          state={state}
          readoutText={readoutText}
          transcript={transcript}
          lastReply={lastReply}
          isPushToTalkActive={isRecording}
        />

        {/* Text Input Fallback Bar */}
        <form
          onSubmit={handleManualSubmit}
          className="relative flex items-center bg-panel/90 border border-core-amber/20 rounded-xl overflow-hidden p-1 backdrop-blur-md focus-within:border-core-amber/60 transition-colors"
        >
          <div className="pl-3 pr-2 text-core-amber">
            <Terminal className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Escribe una instrucción para ${ASSISTANT_NAME} (ej: "prepara un correo para el cliente", "crea un evento mañana")...`}
            className="flex-1 bg-transparent py-2 px-2 text-sm text-neutral-200 placeholder:text-neutral-500 font-body focus:outline-none"
          />
          <button
            type="submit"
            className="p-2.5 rounded-lg bg-core-amber/10 hover:bg-core-amber/20 text-core-amber transition-colors"
            title="Enviar instrucción"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>

      {/* Action modal for email / calendar */}
      <ActionModal action={activeAction} onClose={() => setActiveAction(null)} />
    </main>
  );
}
