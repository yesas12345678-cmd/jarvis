"use client";

import React, { useState, useEffect, useRef } from "react";
import { HolographicCore } from "@/components/HolographicCore";
import { StatusReadout } from "@/components/StatusReadout";
import { ActionModal } from "@/components/ActionModal";
import { MemoryModal } from "@/components/MemoryModal";
import {
  USER_NAME,
  ASSISTANT_NAME,
  ASSISTANT_PRONUNCIATION,
  LANGUAGE,
  AssistantState,
  ActionPayload,
} from "@/lib/constants";
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  ShieldCheck,
  Sparkles,
  Terminal,
  RotateCcw,
  Radio,
  Brain,
} from "lucide-react";

// Variantes fonéticas amplias para activación ("Yud", "Jude", "Oye", etc.) y palabras de interrupción
const WAKE_WORD_REGEX =
  /\b(jude|yud|llud|iud|yut|jud|yood|you\s*d|lud|yur|you|yu|iu|oye\s*yud|hey\s*yud|oye\s*jude|hey\s*jude|oye|para|espera|silencio|cállate|callate|alto|basta|stop)\b/i;

export default function AssistantPage() {
  const [state, setState] = useState<AssistantState>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [lastReply, setLastReply] = useState<string>("");
  const [readoutText, setReadoutText] = useState<string>("SISTEMAS SINCRONIZADOS // DI 'YUD'");
  const [inputText, setInputText] = useState<string>("");
  const [activeAction, setActiveAction] = useState<ActionPayload | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isHandsFree, setIsHandsFree] = useState<boolean>(true);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [permanentMemories, setPermanentMemories] = useState<string[]>([]);
  const [showMemoryModal, setShowMemoryModal] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const isHandsFreeRef = useRef<boolean>(true);
  const stateRef = useRef<AssistantState>("idle");
  const isAwaitingCommandRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    isHandsFreeRef.current = isHandsFree;
  }, [isHandsFree]);

  // Silenciar inmediatamente la voz de Jude para dar paso a Vaita (corte a 0ms)
  const stopSpeaking = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setAudioLevel(0);
  };

  // Cargar memoria histórica (recuerdos permanentes y turnos recientes) desde localStorage
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem("jude_memory");
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) setHistory(parsed);
      }

      const savedMem = localStorage.getItem("jude_permanent_memories");
      if (savedMem) {
        const parsedMem = JSON.parse(savedMem);
        if (Array.isArray(parsedMem)) setPermanentMemories(parsedMem);
      }
    } catch {}
  }, []);

  const saveHistory = (newHistory: Array<{ role: "user" | "assistant"; content: string }>) => {
    setHistory(newHistory);
    try {
      localStorage.setItem("jude_memory", JSON.stringify(newHistory.slice(-25)));
    } catch {}
  };

  const clearRecentHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem("jude_memory");
    } catch {}
    setReadoutText("CONVERSACIÓN ACTUAL REINICIADA");
  };

  const handleAddPermanentMemory = (text: string) => {
    const updated = [...permanentMemories, text];
    setPermanentMemories(updated);
    try {
      localStorage.setItem("jude_permanent_memories", JSON.stringify(updated));
    } catch {}
  };

  const handleDeletePermanentMemory = (index: number) => {
    const updated = permanentMemories.filter((_, i) => i !== index);
    setPermanentMemories(updated);
    try {
      localStorage.setItem("jude_permanent_memories", JSON.stringify(updated));
    } catch {}
  };

  const handleClearAllPermanentMemories = () => {
    setPermanentMemories([]);
    try {
      localStorage.removeItem("jude_permanent_memories");
    } catch {}
  };

  // Iniciar análisis de amplitud del micrófono
  const startAudioAnalysis = async () => {
    if (audioContextRef.current) return;
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

  // Inicializar Web Speech Recognition con soporte continuo para Wake Word
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = LANGUAGE;

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event: any) => {
        let interimText = "";
        let finalText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            finalText += item[0].transcript;
          } else {
            interimText += item[0].transcript;
          }
        }

        const heardText = (finalText || interimText).trim();
        if (!heardText) return;

        // 1. Interrupción instantánea (Barge-in): Si Jude está hablando y escucha voz, cortar de inmediato
        if (stateRef.current === "speaking") {
          stopSpeaking();
          stateRef.current = "listening";
          setState("listening");
          setReadoutText("INTERRUPCIÓN DETECTADA // ESCUCHANDO");
        }

        // 2. Modo Manos Libres (Wake Word: "Yud" / "Jude")
        if (isHandsFreeRef.current) {
          const lower = heardText.toLowerCase();
          const wakeMatch = lower.match(WAKE_WORD_REGEX);

          // Activación desde reposo (idle)
          if (stateRef.current === "idle" && wakeMatch) {
            stopSpeaking();
            setState("listening");
            stateRef.current = "listening";
            setReadoutText("NÚCLEO ACTIVADO // DI 'YUD'");

            // Extraer lo que dijo después de la llamada
            const commandAfter = heardText
              .slice(wakeMatch.index! + wakeMatch[0].length)
              .replace(/^[,.:;\s]+/, "")
              .trim();

            if (commandAfter.length > 2) {
              setTranscript(commandAfter);
              if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

              if (finalText) {
                executeCommand(commandAfter);
              } else {
                silenceTimerRef.current = setTimeout(() => {
                  executeCommand(commandAfter);
                }, 650);
              }
            } else {
              isAwaitingCommandRef.current = true;
              setTranscript("");
              setReadoutText("¿EN QUÉ PUEDO AYUDARLE, VAITA?");
            }
            return;
          }

          // Captura de orden tras despertarse
          if (stateRef.current === "listening" || isAwaitingCommandRef.current) {
            const cleanText = heardText
              .replace(WAKE_WORD_REGEX, "")
              .replace(/^[,.:;\s]+/, "")
              .trim();

            if (cleanText) {
              setTranscript(cleanText);
              if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

              if (finalText) {
                isAwaitingCommandRef.current = false;
                executeCommand(cleanText);
              } else {
                silenceTimerRef.current = setTimeout(() => {
                  isAwaitingCommandRef.current = false;
                  executeCommand(cleanText);
                }, 650);
              }
            }
            return;
          }
        }

        // Push to talk manual
        setTranscript(heardText);
      };

      recognition.onerror = (err: any) => {
        if (err.error !== "no-speech") {
          console.warn("[SPEECH_RECOGNITION_ERROR]", err);
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
        if (isHandsFreeRef.current) {
          setTimeout(() => {
            if (isHandsFreeRef.current && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch {}
            }
          }, 200);
        }
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
        startAudioAnalysis();
      } catch {}
    }

    return () => {
      stopAudioAnalysis();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const toggleHandsFree = () => {
    const nextVal = !isHandsFree;
    setIsHandsFree(nextVal);
    isHandsFreeRef.current = nextVal;

    if (nextVal) {
      startAudioAnalysis();
      try {
        recognitionRef.current?.start();
      } catch {}
      setReadoutText("MANOS LIBRES ACTIVO // DI 'YUD'");
    } else {
      stopSpeaking();
      recognitionRef.current?.stop();
      setState("idle");
      setReadoutText("MODO PUSH-TO-TALK LISTO");
    }
  };

  // Push to talk manual
  const handleStartPushToTalk = () => {
    stopSpeaking();
    setTranscript("");
    startAudioAnalysis();
    try {
      recognitionRef.current?.start();
    } catch {}
    setState("listening");
    stateRef.current = "listening";
  };

  const handleStopPushToTalk = () => {
    if (transcript.trim() && !isHandsFree) {
      executeCommand(transcript.trim());
    } else if (!isHandsFree) {
      setState("idle");
      stateRef.current = "idle";
    }
  };

  // Procesar comando con el cerebro de Jude (Gemini Ultra-Rápido ~650ms + Memoria Permanente)
  const executeCommand = async (command: string) => {
    if (!command.trim()) return;
    setState("processing");
    stateRef.current = "processing";
    setReadoutText("PROCESANDO INTENCIÓN");

    const updatedHistory = [...history, { role: "user" as const, content: command }];
    saveHistory(updatedHistory);

    try {
      const response = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: command,
          history: updatedHistory,
          permanentMemories,
        }),
      });

      const data = await response.json();
      const replyText = data.speech || `A tu orden, ${USER_NAME}.`;
      setLastReply(replyText);
      setReadoutText(data.readout || "RESPUESTA SINTETIZADA");

      // Guardar turno del asistente
      saveHistory([...updatedHistory, { role: "assistant" as const, content: replyText }]);

      // Si Jude aprendió un nuevo hecho permanente para recordar siempre
      if (data.new_memory && typeof data.new_memory === "string") {
        setPermanentMemories((prev) => {
          if (!prev.includes(data.new_memory)) {
            const updated = [...prev, data.new_memory];
            try {
              localStorage.setItem("jude_permanent_memories", JSON.stringify(updated));
            } catch {}
            return updated;
          }
          return prev;
        });
      }

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
    stateRef.current = "speaking";
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
        currentAudioRef.current = audio;

        audio.onplay = () => {
          setAudioLevel(0.65);
        };
        audio.onended = () => {
          if (currentAudioRef.current === audio) {
            currentAudioRef.current = null;
          }
          setState("idle");
          stateRef.current = "idle";
          setAudioLevel(0);
          setReadoutText(
            isHandsFree ? "STANDBY // ESCUCHANDO: DI 'YUD'..." : "STANDBY // NÚCLEO LISTO"
          );
          URL.revokeObjectURL(audioUrl);
        };
        audio.onpause = () => {
          setAudioLevel(0);
        };
        audio.onerror = () => {
          if (currentAudioRef.current === audio) {
            currentAudioRef.current = null;
          }
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
      stateRef.current = "idle";
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANGUAGE;
    utterance.rate = 1.05;
    utterance.onstart = () => setAudioLevel(0.5);
    utterance.onend = () => {
      setState("idle");
      stateRef.current = "idle";
      setAudioLevel(0);
      setReadoutText(
        isHandsFree ? "STANDBY // ESCUCHANDO: DI 'YUD'..." : "STANDBY // NÚCLEO LISTO"
      );
    };
    utterance.onerror = () => {
      setState("idle");
      stateRef.current = "idle";
      setAudioLevel(0);
    };
    window.speechSynthesis.speak(utterance);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    stopSpeaking();
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

        <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono">
          {/* Botón Banco de Memoria Permanente */}
          <button
            onClick={() => setShowMemoryModal(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-core-amber/10 border border-core-amber/30 hover:border-core-amber text-core-amber transition-all shadow-hologram"
            title="Ver los hechos y datos permanentes que Jude recuerda sobre ti"
          >
            <Brain className="w-3.5 h-3.5" />
            <span>MEMORIA: {permanentMemories.length} RECUERDOS</span>
          </button>

          {/* Toggle Manos Libres ("Yud") vs Push-to-Talk */}
          <button
            onClick={toggleHandsFree}
            className={`hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all ${
              isHandsFree
                ? "bg-core-amber/15 border-core-amber text-core-amber shadow-hologram"
                : "bg-panel border-neutral-800 text-neutral-400 hover:text-white"
            }`}
            title="Alternar entre activación por voz 'Yud' y pulsar para hablar"
          >
            <Radio className={`w-3 h-3 ${isHandsFree ? "animate-pulse" : ""}`} />
            <span>{isHandsFree ? "WAKE WORD: 'YUD'" : "PUSH-TO-TALK"}</span>
          </button>

          {/* Reiniciar conversación actual */}
          <button
            onClick={clearRecentHistory}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-panel border border-neutral-800 hover:border-core-amber/30 text-neutral-400 hover:text-white transition-colors"
            title="Limpiar hilo de la conversación actual"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{history.length} turnos</span>
          </button>

          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-panel border border-core-amber/20 text-neutral-300">
            <ShieldCheck className="w-3.5 h-3.5 text-core-amber" />
            <span>
              USUARIO: <strong className="text-white">{USER_NAME}</strong>
            </span>
          </div>
        </div>
      </header>

      {/* Center Holographic Stage */}
      <section className="flex-1 flex flex-col items-center justify-center my-4 sm:my-8 relative">
        <HolographicCore
          state={state}
          audioLevel={audioLevel}
          onClick={() => {
            startAudioAnalysis();
            if (isHandsFree) {
              setReadoutText("NÚCLEO EN ESCUCHA // DI 'YUD'");
            } else {
              handleStartPushToTalk();
            }
          }}
        />

        {/* Central status / action button */}
        <div className="mt-4 flex flex-col items-center gap-2">
          {isHandsFree ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-core-amber/10 border border-core-amber/40 text-core-amber font-mono text-xs font-semibold tracking-wider shadow-hologram animate-pulse">
                <span className="w-2 h-2 rounded-full bg-core-amber" />
                <span>MANOS LIBRES ACTIVO · SOLO DI: &quot;YUD&quot;</span>
              </div>
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                Si Jude está hablando, di &quot;Yud&quot; para callarlo y darle una nueva orden
              </span>
            </div>
          ) : (
            <button
              onMouseDown={handleStartPushToTalk}
              onMouseUp={handleStopPushToTalk}
              onTouchStart={handleStartPushToTalk}
              onTouchEnd={handleStopPushToTalk}
              className={`flex items-center gap-2.5 px-6 py-3 rounded-full font-mono text-xs font-semibold tracking-wider transition-all duration-300 shadow-hologram select-none active:scale-95 ${
                state === "listening"
                  ? "bg-core-spark text-white ring-4 ring-core-spark/30 animate-pulse"
                  : "bg-core-amber hover:bg-core-amber/90 text-black"
              }`}
            >
              {state === "listening" ? (
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
          )}
        </div>
      </section>

      {/* Bottom Telemetry & Input Panel */}
      <footer className="flex flex-col gap-4">
        <StatusReadout
          state={state}
          readoutText={readoutText}
          transcript={transcript}
          lastReply={lastReply}
          isPushToTalkActive={state === "listening"}
          isHandsFree={isHandsFree}
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
            placeholder={`Escribe una instrucción para ${ASSISTANT_NAME} (o di en voz alta "Yud, prepara un correo...")...`}
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

      {/* Memory management modal */}
      <MemoryModal
        isOpen={showMemoryModal}
        onClose={() => setShowMemoryModal(false)}
        memories={permanentMemories}
        onAddMemory={handleAddPermanentMemory}
        onDeleteMemory={handleDeletePermanentMemory}
        onClearAll={handleClearAllPermanentMemories}
      />
    </main>
  );
}
