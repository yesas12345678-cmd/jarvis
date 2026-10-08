"use client";

import React, { useState, useEffect, useRef } from "react";
import { HolographicCore } from "@/components/HolographicCore";
import { StatusReadout } from "@/components/StatusReadout";
import { ActionModal } from "@/components/ActionModal";
import { MemoryModal } from "@/components/MemoryModal";
import { TimerWidget, ActiveTimer } from "@/components/TimerWidget";
import { NotesDrawer } from "@/components/NotesDrawer";
import { ThemeSelector } from "@/components/ThemeSelector";
import { soundEngine } from "@/lib/soundEngine";
import {
  USER_NAME,
  ASSISTANT_NAME,
  ASSISTANT_PRONUNCIATION,
  LANGUAGE,
  AssistantState,
  ActionPayload,
  CoreTheme,
  THEMES,
} from "@/lib/constants";
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  Sparkles,
  Terminal,
  RotateCcw,
  Radio,
  Brain,
  Clock,
  FileText,
  Battery,
  Wifi,
  Waves,
  Zap,
} from "lucide-react";

// Variantes fonéticas amplias para activación ("Yud", "Jude", "Oye", etc.) y palabras de interrupción
const WAKE_WORD_REGEX =
  /\b(jude|yud|llud|iud|yut|jud|yood|you\s*d|lud|yur|you|yu|iu|oye\s*yud|hey\s*yud|oye\s*jude|hey\s*jude|oye|para|espera|silencio|cállate|callate|alto|basta|stop)\b/i;

const INTERRUPT_REGEX =
  /\b(para|espera|silencio|cállate|callate|alto|basta|stop|yud|jude|oye)\b/i;

export default function AssistantPage() {
  const [state, setState] = useState<AssistantState>("idle");
  const [theme, setTheme] = useState<CoreTheme>("mark3");
  const [transcript, setTranscript] = useState<string>("" );
  const [lastReply, setLastReply] = useState<string>("");
  const [readoutText, setReadoutText] = useState<string>("SISTEMAS SINCRONIZADOS // DI 'YUD'");
  const [inputText, setInputText] = useState<string>("");
  const [activeAction, setActiveAction] = useState<ActionPayload | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isHandsFree, setIsHandsFree] = useState<boolean>(true);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [permanentMemories, setPermanentMemories] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);

  // Modales
  const [showMemoryModal, setShowMemoryModal] = useState<boolean>(false);
  const [showNotesDrawer, setShowNotesDrawer] = useState<boolean>(false);

  // Telemetría de hardware
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isAmbientOn, setIsAmbientOn] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const isHandsFreeRef = useRef<boolean>(true);
  const stateRef = useRef<AssistantState>("idle");
  const themeRef = useRef<CoreTheme>("mark3");
  const isAwaitingCommandRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpokenTimeRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    isHandsFreeRef.current = isHandsFree;
  }, [isHandsFree]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const activePalette = THEMES[theme] || THEMES.mark3;

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
    lastSpokenTimeRef.current = Date.now();
  };

  // Reloj digital y telemetría de batería en tiempo real
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("es-ES", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 1000);

    // Battery API
    if (typeof navigator !== "undefined" && (navigator as any).getBattery) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        setIsCharging(battery.charging);
        battery.addEventListener("levelchange", () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
        battery.addEventListener("chargingchange", () => {
          setIsCharging(battery.charging);
        });
      }).catch(() => {});
    }

    return () => clearInterval(clockInterval);
  }, []);

  // Cargar memoria histórica, notas y tema desde localStorage
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

      const savedNotes = localStorage.getItem("jude_notes");
      if (savedNotes) {
        const parsedNotes = JSON.parse(savedNotes);
        if (Array.isArray(parsedNotes)) setNotes(parsedNotes);
      }

      const savedTheme = localStorage.getItem("jude_theme") as CoreTheme;
      if (savedTheme && THEMES[savedTheme]) {
        setTheme(savedTheme);
      }
    } catch {}
  }, []);

  // Guardar tema
  const handleSelectTheme = (t: CoreTheme) => {
    setTheme(t);
    try {
      localStorage.setItem("jude_theme", t);
    } catch {}
  };

  const cycleTheme = () => {
    const themeKeys: CoreTheme[] = ["mark3", "arc", "combat", "matrix", "violet"];
    const nextIdx = (themeKeys.indexOf(theme) + 1) % themeKeys.length;
    handleSelectTheme(themeKeys[nextIdx]);
    soundEngine.playActionConfirm();
  };

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
    soundEngine.playCancelChirp();
    setReadoutText("CONVERSACIÓN ACTUAL REINICIADA");
  };

  // Manejo de Notas
  const handleAddNote = (text: string) => {
    const updated = [text, ...notes];
    setNotes(updated);
    try {
      localStorage.setItem("jude_notes", JSON.stringify(updated));
    } catch {}
  };

  const handleDeleteNote = (index: number) => {
    const updated = notes.filter((_, i) => i !== index);
    setNotes(updated);
    try {
      localStorage.setItem("jude_notes", JSON.stringify(updated));
    } catch {}
  };

  const handleClearAllNotes = () => {
    setNotes([]);
    try {
      localStorage.removeItem("jude_notes");
    } catch {}
  };

  // Manejo de Memoria Permanente
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

  // Manejo de Ruido Ambiental
  const toggleAmbientSound = () => {
    const newState = soundEngine.toggleAmbient();
    setIsAmbientOn(newState);
  };

  // Captura y análisis de amplitud de audio
  const startAudioAnalysis = async () => {
    if (audioContextRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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

  // Atajos de teclado para uso pro
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Si el usuario está escribiendo en un input, ignorar atajos de un solo caracter
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        if (e.key === "Escape") {
          (document.activeElement as HTMLElement)?.blur();
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        stopSpeaking();
        soundEngine.playCancelChirp();
        setState("idle");
        setReadoutText("COMANDO CANCELADO // STANDBY");
      } else if (e.key === "m" || e.key === "M") {
        setShowMemoryModal((prev) => !prev);
      } else if (e.key === "t" || e.key === "T") {
        setShowNotesDrawer((prev) => !prev);
      } else if (e.key === "c" || e.key === "C") {
        cycleTheme();
      } else if (e.key === "h" || e.key === "H") {
        toggleHandsFree();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [theme, isHandsFree]);

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

        // Evitar eco de retroalimentación en los primeros 300ms tras hablar Jude
        if (Date.now() - lastSpokenTimeRef.current < 450) {
          return;
        }

        // 1. Interrupción instantánea (Barge-in): Si Jude está hablando y escucha voz
        if (stateRef.current === "speaking") {
          stopSpeaking();
          soundEngine.playWakeChime();
          stateRef.current = "listening";
          setState("listening");
          setReadoutText("INTERRUPCIÓN // ESCUCHANDO");
        }

        // 2. Modo Manos Libres (Wake Word: "Yud" / "Jude")
        if (isHandsFreeRef.current) {
          const lower = heardText.toLowerCase();
          const wakeMatch = lower.match(WAKE_WORD_REGEX);

          // Activación desde reposo (idle)
          if (stateRef.current === "idle" && wakeMatch) {
            stopSpeaking();
            soundEngine.playWakeChime();
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
      soundEngine.playActionConfirm();
      setReadoutText("MANOS LIBRES ACTIVO // DI 'YUD'");
    } else {
      stopSpeaking();
      recognitionRef.current?.stop();
      setState("idle");
      soundEngine.playCancelChirp();
      setReadoutText("MODO PUSH-TO-TALK LISTO");
    }
  };

  // Push to talk manual
  const handleStartPushToTalk = () => {
    stopSpeaking();
    soundEngine.playWakeChime();
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

  // Procesar comando con el cerebro de Jude
  const executeCommand = async (command: string) => {
    if (!command.trim()) return;
    setState("processing");
    stateRef.current = "processing";
    soundEngine.playProcessingHum();
    setReadoutText("PROCESANDO INTENCIÓN");

    const startTime = performance.now();
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
      const endTime = performance.now();
      setLatencyMs(Math.round(endTime - startTime));

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

      // Si hay acción asociada
      if (data.action) {
        // Temporizador
        if (data.action.type === "timer" && data.action.durationSeconds) {
          setActiveTimer({
            id: Date.now().toString(),
            label: data.action.timerLabel || "Temporizador",
            totalSeconds: data.action.durationSeconds,
            remainingSeconds: data.action.durationSeconds,
          });
          soundEngine.playActionConfirm();
        }
        // Nota
        else if (data.action.type === "note" && data.action.noteContent) {
          handleAddNote(data.action.noteContent);
          soundEngine.playActionConfirm();
        }
        // Cambio de tema
        else if (data.action.type === "theme" && data.action.targetTheme) {
          handleSelectTheme(data.action.targetTheme);
          soundEngine.playActionConfirm();
        }
        // Sonido ambiental
        else if (data.action.type === "ambient") {
          const targetState = data.action.ambientState ?? !isAmbientOn;
          soundEngine.toggleAmbient(targetState);
          setIsAmbientOn(targetState);
        }
        // Email / Calendar
        else if (data.action.type === "email" || data.action.type === "calendar") {
          setActiveAction(data.action);
          soundEngine.playActionConfirm();
        }
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
          lastSpokenTimeRef.current = Date.now();
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
      lastSpokenTimeRef.current = Date.now();
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
    <main className="hologram-grid min-h-screen flex flex-col justify-between p-4 sm:p-6 md:p-8 max-w-6xl mx-auto selection:bg-white selection:text-black">
      {/* Header Holográfico */}
      <header
        className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 transition-colors duration-300"
        style={{ borderColor: activePalette.border }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full animate-pulse"
            style={{
              backgroundColor: activePalette.secondary,
              boxShadow: `0 0 12px ${activePalette.glow}`,
            }}
          />
          <div>
            <h1
              className="text-base sm:text-lg font-bold font-mono tracking-widest uppercase flex items-center gap-2"
              style={{ color: activePalette.primary }}
            >
              {ASSISTANT_NAME}
              <span className="text-xs font-normal opacity-70 font-mono">
                [{ASSISTANT_PRONUNCIATION}]
              </span>
            </h1>
            <p className="text-[11px] text-neutral-400 font-mono">
              NÚCLEO CUÁNTICO // {USER_NAME} // {activePalette.badge}
            </p>
          </div>
        </div>

        {/* Telemetría Central (Hora, Latencia, Batería) */}
        <div className="hidden md:flex items-center gap-4 text-xs font-mono text-neutral-400 bg-black/60 px-4 py-2 rounded-xl border border-white/10 backdrop-blur-md">
          {currentTime && (
            <div className="flex items-center gap-1.5 text-white/90">
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
              <span>{currentTime}</span>
            </div>
          )}

          {latencyMs !== null && (
            <div className="flex items-center gap-1.5" style={{ color: activePalette.secondary }}>
              <Zap className="w-3.5 h-3.5" />
              <span>{latencyMs}ms</span>
            </div>
          )}

          {batteryLevel !== null && (
            <div className="flex items-center gap-1.5 text-neutral-300">
              <Battery className="w-3.5 h-3.5 text-neutral-400" />
              <span>
                {batteryLevel}% {isCharging ? "⚡" : ""}
              </span>
            </div>
          )}
        </div>

        {/* Acciones y Selectores del Header */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de Tema */}
          <ThemeSelector currentTheme={theme} onSelectTheme={handleSelectTheme} />

          {/* Generador de Sonido Ambiental */}
          <button
            onClick={toggleAmbientSound}
            title={isAmbientOn ? "Desactivar Ruido Ambiental" : "Activar Ruido Ambiental (Theta)"}
            className={`p-2 rounded-xl border text-xs font-mono transition-all duration-300 flex items-center gap-1.5 ${
              isAmbientOn
                ? "bg-white/10 text-white border-white/40 shadow-lg"
                : "bg-black/60 text-white/50 border-white/10 hover:text-white"
            }`}
          >
            <Waves className="w-4 h-4" />
          </button>

          {/* Botón Notas / Tareas */}
          <button
            onClick={() => setShowNotesDrawer(true)}
            className="p-2 rounded-xl border border-white/10 bg-black/60 hover:bg-white/10 text-white/80 hover:text-white transition-all text-xs font-mono flex items-center gap-1.5 relative"
            title="Abrir Notas & Pendientes (T)"
          >
            <FileText className="w-4 h-4" />
            {notes.length > 0 && (
              <span
                className="w-2 h-2 rounded-full absolute -top-1 -right-1"
                style={{ backgroundColor: activePalette.secondary }}
              />
            )}
          </button>

          {/* Botón Memoria Permanente */}
          <button
            onClick={() => setShowMemoryModal(true)}
            className="p-2 rounded-xl border border-white/10 bg-black/60 hover:bg-white/10 text-white/80 hover:text-white transition-all text-xs font-mono flex items-center gap-1.5"
            title="Memoria Permanente (M)"
          >
            <Brain className="w-4 h-4" />
            <span className="hidden sm:inline">MEMORIA ({permanentMemories.length})</span>
          </button>

          {/* Toggle Manos Libres */}
          <button
            onClick={toggleHandsFree}
            className="px-3 py-1.5 rounded-xl border text-xs font-mono font-semibold transition-all duration-300 flex items-center gap-2"
            style={{
              backgroundColor: isHandsFree ? `${activePalette.secondary}20` : "rgba(0,0,0,0.6)",
              borderColor: isHandsFree ? activePalette.secondary : "rgba(255,255,255,0.15)",
              color: isHandsFree ? activePalette.primary : "#888888",
            }}
            title="Alternar Manos Libres (H)"
          >
            <Radio
              className={`w-3.5 h-3.5 ${isHandsFree ? "animate-pulse" : ""}`}
              style={{ color: isHandsFree ? activePalette.secondary : "#666" }}
            />
            <span className="hidden sm:inline">
              {isHandsFree ? "MANOS LIBRES: ON" : "PUSH-TO-TALK"}
            </span>
          </button>
        </div>
      </header>

      {/* Núcleo Holográfico Central */}
      <section className="relative my-auto flex flex-col items-center justify-center py-6">
        <HolographicCore
          state={state}
          theme={theme}
          audioLevel={audioLevel}
          onClick={state === "speaking" ? stopSpeaking : handleStartPushToTalk}
        />

        {/* Indicador de Estado Flotante */}
        <div className="mt-4 flex items-center gap-3">
          <div
            className="px-4 py-1.5 rounded-full border text-xs font-mono tracking-widest uppercase transition-all duration-300 flex items-center gap-2 backdrop-blur-md"
            style={{
              borderColor: activePalette.border,
              backgroundColor: "rgba(10, 8, 6, 0.85)",
              color: activePalette.primary,
              boxShadow: state === "speaking" ? `0 0 20px ${activePalette.glow}` : "none",
            }}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                state === "speaking" || state === "listening" ? "animate-ping" : ""
              }`}
              style={{ backgroundColor: activePalette.secondary }}
            />
            <span>
              {state === "speaking"
                ? "JUDE TRANSMITIENDO (CLIC PARA CORTAR)"
                : state === "listening"
                ? "ESCUCHANDO A VAITA..."
                : state === "processing"
                ? "PROCESANDO INTENCIÓN..."
                : isHandsFree
                ? "DI 'YUD' O PULSA EL NÚCLEO"
                : "PULSA Y MANTÉN PARA HABLAR"}
            </span>
          </div>

          {state === "speaking" && (
            <button
              onClick={stopSpeaking}
              className="p-1.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-all text-xs"
              title="Silenciar ahora (Esc)"
            >
              <VolumeX className="w-4 h-4" />
            </button>
          )}
        </div>
      </section>

      {/* Widget de Temporizador Flotante */}
      <TimerWidget
        timer={activeTimer}
        theme={theme}
        onDismiss={() => setActiveTimer(null)}
      />

      {/* Telemetría y Paneles */}
      <footer className="flex flex-col gap-4 mt-auto pt-4">
        <StatusReadout
          state={state}
          theme={theme}
          readoutText={readoutText}
          transcript={transcript}
          lastReply={lastReply}
          isPushToTalkActive={isRecording && !isHandsFree}
          isHandsFree={isHandsFree}
        />

        {/* Barra de Entrada Manual & Controles */}
        <form onSubmit={handleManualSubmit} className="flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                isHandsFree
                  ? `Habla con "Yud..." o escribe una orden para ${ASSISTANT_NAME}...`
                  : `Escribe o presiona el micrófono para hablar con ${ASSISTANT_NAME}...`
              }
              className="w-full bg-black/60 border rounded-xl px-4 py-3 text-sm text-neutral-100 placeholder-neutral-500 font-body focus:outline-none transition-all duration-300"
              style={{
                borderColor: inputText ? activePalette.secondary : "rgba(255,255,255,0.1)",
                boxShadow: inputText ? `0 0 15px ${activePalette.glow}` : "none",
              }}
            />
          </div>

          {/* Botón Push-To-Talk */}
          {!isHandsFree && (
            <button
              type="button"
              onMouseDown={handleStartPushToTalk}
              onMouseUp={handleStopPushToTalk}
              onTouchStart={handleStartPushToTalk}
              onTouchEnd={handleStopPushToTalk}
              className={`p-3 rounded-xl border transition-all duration-300 ${
                state === "listening"
                  ? "bg-red-500/20 border-red-500 text-red-400 scale-105"
                  : "bg-black/60 border-white/15 text-neutral-300 hover:text-white"
              }`}
              title="Mantén presionado para hablar"
            >
              <Mic className="w-5 h-5" />
            </button>
          )}

          {/* Botón Enviar */}
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-3 rounded-xl font-mono text-xs font-bold text-black transition-all duration-300 disabled:opacity-30 disabled:pointer-events-none hover:brightness-110 active:scale-95"
            style={{ backgroundColor: activePalette.secondary }}
            title="Enviar mensaje"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>

        {/* Pie de atajos y reinicio */}
        <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500 pt-2 border-t border-white/5">
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline">ATAJOS:</span>
            <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10">Esc: Silenciar</span>
            <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10">M: Memoria</span>
            <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10">T: Tareas</span>
            <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10">C: Tema</span>
            <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10">H: Manos libres</span>
          </div>

          <button
            onClick={clearRecentHistory}
            className="hover:text-red-400 flex items-center gap-1 transition-colors"
            title="Borrar conversación de la sesión"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Limpiar sesión</span>
          </button>
        </div>
      </footer>

      {/* Modal de Acción (Email / Calendario) */}
      <ActionModal
        isOpen={!!activeAction}
        action={activeAction}
        onClose={() => setActiveAction(null)}
      />

      {/* Modal de Memoria Permanente */}
      <MemoryModal
        isOpen={showMemoryModal}
        memories={permanentMemories}
        onClose={() => setShowMemoryModal(false)}
        onAddMemory={handleAddPermanentMemory}
        onDeleteMemory={handleDeletePermanentMemory}
        onClearAll={handleClearAllPermanentMemories}
      />

      {/* Cajón de Notas y Tareas */}
      <NotesDrawer
        isOpen={showNotesDrawer}
        notes={notes}
        theme={theme}
        onClose={() => setShowNotesDrawer(false)}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
        onClearNotes={handleClearAllNotes}
      />
    </main>
  );
}
