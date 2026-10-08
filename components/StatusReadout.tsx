"use client";

import React from "react";
import { AssistantState, USER_NAME, ASSISTANT_NAME, ASSISTANT_PRONUNCIATION } from "@/lib/constants";
import { Activity, Radio, Cpu, Sparkles } from "lucide-react";

interface StatusReadoutProps {
  state: AssistantState;
  readoutText: string;
  transcript: string;
  lastReply: string;
  isPushToTalkActive: boolean;
}

export const StatusReadout: React.FC<StatusReadoutProps> = ({
  state,
  readoutText,
  transcript,
  lastReply,
  isPushToTalkActive,
}) => {
  const getStatusBadge = () => {
    switch (state) {
      case "listening":
        return { text: "ESCビCHANDO ENTRADA", color: "text-core-light border-core-amber bg-core-amber/10 animate-pulse" };
      case "processing":
        return { text: "CALCULANDO RESPUESTA", color: "text-core-orange border-core-orange bg-core-orange/15 animate-spin-slow" };
      case "speaking":
        return { text: "TRANSMITIENDO VOZ", color: "text-core-amber border-core-amber bg-core-amber/20" };
      default:
        return { text: "STANDBY // NÚCLEO ACTIVO", color: "text-neutral-400 border-neutral-800 bg-neutral-950/60" };
    }
  };

  const badge = getStatusBadge();

  return (
    <div className="w-full flex flex-col gap-4 text-xs font-mono select-none">
      {/* Top telemetry bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-core-amber/15 pb-2">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-core-amber" />
          <span className="tracking-widest uppercase text-neutral-300 font-semibold">
            {ASSISTANT_NAME} ({ASSISTANT_PRONUNCIATION}) OS v4.2
          </span>
          <span className="text-neutral-600">//</span>
          <span className="text-core-amber tracking-wider">{USER_NAME}</span>
        </div>

        <div className={`px-2 py-0.5 border rounded text-[10px] tracking-widest ${badge.color}`}>
          {badge.text}
        </div>
      </div>

      {/* Real-time readout & transcript */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Terminal log panel */}
        <div className="bg-panel/80 border border-core-amber/15 rounded-lg p-3 backdrop-blur-md flex flex-col gap-2">
          <div className="flex items-center justify-between text-neutral-500 text-[10px] tracking-wider uppercase border-b border-white/5 pb-1">
            <span className="flex items-center gap-1.5 text-core-amber">
              <Radio className="w-3 h-3" />
              Entrada de voz ({USER_NAME})
            </span>
            <span>{isPushToTalkActive ? "MICRÓFONO EN VIVO" : "PUSH-TO-TALK LISTO"}</span>
          </div>
          <p className="font-body text-sm text-neutral-200 min-h-[44px] flex items-center">
            {transcript ? (
              <span>&ldquo;{transcript}&rdquo;</span>
            ) : (
              <span className="text-neutral-500 italic">
                Mantén presionado el botón central o presiona la barra espaciadora para hablar con {ASSISTANT_NAME}...
              </span>
            )}
          </p>
        </div>

        {/* Jude's Response Panel */}
        <div className="bg-panel/80 border border-core-amber/15 rounded-lg p-3 backdrop-blur-md flex flex-col gap-2">
          <div className="flex items-center justify-between text-neutral-500 text-[10px] tracking-wider uppercase border-b border-white/5 pb-1">
            <span className="flex items-center gap-1.5 text-core-orange">
              <Sparkles className="w-3 h-3" />
              Respuesta Holográfica
            </span>
            <span className="text-core-amber/80">{readoutText || "EN ESPERA"}</span>
          </div>
          <p className="font-body text-sm text-core-light min-h-[44px] flex items-center">
            {lastReply ? (
              <span className="text-white drop-shadow-[0_0_12px_rgba(255,176,32,0.3)]">
                {lastReply}
              </span>
            ) : (
              <span className="text-neutral-500 italic">
                {ASSISTANT_NAME} está en reposo. Di algo como: &quot;Jude, prepara un correo para el equipo&quot; o &quot;Jude, ¿qué hora es?&quot;
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
