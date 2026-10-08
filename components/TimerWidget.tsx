"use client";

import React, { useEffect, useState } from "react";
import { soundEngine } from "@/lib/soundEngine";
import { THEMES, CoreTheme } from "@/lib/constants";
import { Clock, X, Bell } from "lucide-react";

export interface ActiveTimer {
  id: string;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
}

interface TimerWidgetProps {
  timer: ActiveTimer | null;
  theme: CoreTheme;
  onDismiss: () => void;
}

export const TimerWidget: React.FC<TimerWidgetProps> = ({ timer, theme, onDismiss }) => {
  const [remaining, setRemaining] = useState<number>(timer ? timer.remainingSeconds : 0);
  const [isAlarming, setIsAlarming] = useState<boolean>(false);
  const activePalette = THEMES[theme] || THEMES.mark3;

  useEffect(() => {
    if (!timer) {
      setIsAlarming(false);
      return;
    }
    setRemaining(timer.remainingSeconds);
    setIsAlarming(false);

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsAlarming(true);
          soundEngine.playTimerAlarm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timer]);

  if (!timer) return null;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const progressPercent = Math.max(0, (remaining / (timer.totalSeconds || 1)) * 100);

  return (
    <div
      className={`fixed bottom-24 right-6 z-40 p-4 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 flex items-center gap-4 ${
        isAlarming ? "animate-bounce" : ""
      }`}
      style={{
        backgroundColor: "rgba(10, 8, 6, 0.92)",
        borderColor: isAlarming ? "#FF1744" : activePalette.secondary,
        boxShadow: `0 0 25px ${isAlarming ? "rgba(255, 23, 68, 0.6)" : activePalette.glow}`,
      }}
    >
      <div className="relative w-12 h-12 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
          <path
            className="text-white/10"
            strokeWidth="3"
            stroke="currentColor"
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path
            strokeDasharray={`${progressPercent}, 100`}
            strokeWidth="3"
            strokeLinecap="round"
            stroke={isAlarming ? "#FF1744" : activePalette.secondary}
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {isAlarming ? (
            <Bell className="w-5 h-5 text-red-500 animate-spin" />
          ) : (
            <Clock className="w-5 h-5 text-white/80" />
          )}
        </div>
      </div>

      <div className="flex flex-col">
        <span className="text-[10px] tracking-widest font-mono uppercase text-white/60">
          {timer.label || "TEMPORIZADOR"}
        </span>
        <span
          className="text-2xl font-bold font-mono tracking-wider"
          style={{ color: isAlarming ? "#FF5252" : activePalette.primary }}
        >
          {formattedTime}
        </span>
      </div>

      <button
        onClick={() => {
          soundEngine.playCancelChirp();
          onDismiss();
        }}
        className="ml-2 p-1.5 rounded-lg border border-white/10 hover:border-white/30 text-white/60 hover:text-white transition-colors"
        title="Descartar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
