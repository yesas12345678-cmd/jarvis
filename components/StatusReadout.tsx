"use client";

import React from "react";
import {
  AssistantState,
  USER_NAME,
  ASSISTANT_NAME,
  ASSISTANT_PRONUNCIATION,
  CoreTheme,
  THEMES,
} from "@/lib/constants";
import { Cpu, Radio, Sparkles, Activity } from "lucide-react";

interface StatusReadoutProps {
  state: AssistantState;
  theme?: CoreTheme;
  readoutText: string;
  transcript: string;
  lastReply: string;
  isPushToTalkActive: boolean;
  isHandsFree?: boolean;
}

export const StatusReadout: React.FC<StatusReadoutProps> = ({
  state,
  theme = "mark3",
  readoutText,
  transcript,
  lastReply,
  isPushToTalkActive,
  isHandsFree = true,
}) => {
  const activePalette = THEMES[theme] || THEMES.mark3;

  const getStatusBadge = () => {
    switch (state) {
      case "listening":
        return {
          text: "ESCUCHANDO ENTRADA",
          style: {
            color: activePalette.primary,
            borderColor: activePalette.secondary,
            backgroundColor: `${activePalette.secondary}20`,
          },
        };
      case "processing":
        return {
          text: "CALCULANDO RESPUESTA",
          style: {
            color: activePalette.accent,
            borderColor: activePalette.accent,
            backgroundColor: `${activePalette.accent}20`,
          },
        };
      case "speaking":
        return {
          text: "TRANSMITIENDO VOZ",
          style: {
            color: activePalette.primary,
            borderColor: activePalette.secondary,
            backgroundColor: `${activePalette.secondary}30`,
          },
        };
      default:
        return {
          text: isHandsFree ? "STANDBY // ESCUCHA 'YUD' ACTIVA" : "STANDBY // PUSH-TO-TALK LISTO",
          style: {
            color: isHandsFree ? activePalette.secondary : "#888888",
            borderColor: isHandsFree ? activePalette.border : "rgba(255,255,255,0.1)",
            backgroundColor: isHandsFree ? `${activePalette.secondary}10` : "rgba(0,0,0,0.4)",
          },
        };
    }
  };

  const badge = getStatusBadge();

  return (
    <div className="w-full flex flex-col gap-4 text-xs font-mono select-none">
      {/* Barra superior de telemetría */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 transition-colors duration-300"
        style={{ borderColor: activePalette.border }}
      >
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5" style={{ color: activePalette.secondary }} />
          <span className="tracking-widest uppercase text-neutral-300 font-semibold">
            {ASSISTANT_NAME} ({ASSISTANT_PRONUNCIATION}) OS v4.2
          </span>
          <span className="text-neutral-600">//</span>
          <span className="tracking-wider font-bold" style={{ color: activePalette.secondary }}>
            {USER_NAME}
          </span>
          <span className="text-neutral-600">//</span>
          <span className="text-[10px] tracking-wider text-neutral-400">
            {activePalette.badge}
          </span>
        </div>

        <div
          className="px-2.5 py-0.5 border rounded text-[10px] tracking-widest transition-all duration-300"
          style={badge.style}
        >
          {badge.text}
        </div>
      </div>

      {/* Cuadrícula de registro y transcripción */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Panel de voz del usuario */}
        <div
          className="bg-black/80 border rounded-xl p-3.5 backdrop-blur-md flex flex-col gap-2 transition-all duration-300"
          style={{ borderColor: activePalette.border }}
        >
          <div className="flex items-center justify-between text-neutral-500 text-[10px] tracking-wider uppercase border-b border-white/5 pb-1">
            <span className="flex items-center gap-1.5" style={{ color: activePalette.secondary }}>
              <Radio className="w-3 h-3" />
              Entrada de voz ({USER_NAME})
            </span>
            <span>
              {isHandsFree
                ? "MANOS LIBRES ACTIVO (DI 'YUD')"
                : isPushToTalkActive
                ? "MICRÓFONO EN VIVO"
                : "PUSH-TO-TALK LISTO"}
            </span>
          </div>
          <p className="font-body text-sm text-neutral-200 min-h-[44px] flex items-center">
            {transcript ? (
              <span>&ldquo;{transcript}&rdquo;</span>
            ) : (
              <span className="text-neutral-500 italic">
                {isHandsFree
                  ? `Di directamente: "Yud, ¿qué hora es?", "Yud, pon temporizador..." o "Yud, modo combate"`
                  : `Mantén presionado el botón central o presiona la barra espaciadora para hablar con ${ASSISTANT_NAME}...`}
              </span>
            )}
          </p>
        </div>

        {/* Panel de respuesta de Jude */}
        <div
          className="bg-black/80 border rounded-xl p-3.5 backdrop-blur-md flex flex-col gap-2 transition-all duration-300"
          style={{
            borderColor: activePalette.border,
            boxShadow: state === "speaking" ? `0 0 20px ${activePalette.glow}` : "none",
          }}
        >
          <div className="flex items-center justify-between text-neutral-500 text-[10px] tracking-wider uppercase border-b border-white/5 pb-1">
            <span className="flex items-center gap-1.5" style={{ color: activePalette.accent }}>
              <Sparkles className="w-3 h-3" />
              Respuesta Holográfica
            </span>
            <span style={{ color: activePalette.secondary }}>{readoutText || "EN ESPERA"}</span>
          </div>
          <p className="font-body text-sm min-h-[44px] flex items-center">
            {lastReply ? (
              <span className="text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]">
                {lastReply}
              </span>
            ) : (
              <span className="text-neutral-500 italic">
                {ASSISTANT_NAME} está en reposo. Di algo como: &quot;Yud, prepara un correo&quot; o &quot;Yud, ¿qué tiempo hace en Madrid?&quot;
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
