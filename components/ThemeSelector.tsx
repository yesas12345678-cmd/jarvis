"use client";

import React from "react";
import { THEMES, CoreTheme } from "@/lib/constants";
import { soundEngine } from "@/lib/soundEngine";
import { Palette } from "lucide-react";

interface ThemeSelectorProps {
  currentTheme: CoreTheme;
  onSelectTheme: (theme: CoreTheme) => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  currentTheme,
  onSelectTheme,
}) => {
  const themesList = Object.keys(THEMES) as CoreTheme[];

  return (
    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/60 border border-white/10 backdrop-blur-md">
      {themesList.map((t) => {
        const item = THEMES[t];
        const isSelected = currentTheme === t;
        return (
          <button
            key={t}
            onClick={() => {
              onSelectTheme(t);
              soundEngine.playActionConfirm();
            }}
            title={item.name}
            className={`w-5 h-5 rounded-full transition-all duration-300 relative flex items-center justify-center ${
              isSelected ? "scale-125 ring-2 ring-white/80" : "opacity-60 hover:opacity-100"
            }`}
            style={{
              backgroundColor: item.secondary,
              boxShadow: isSelected ? `0 0 10px ${item.glow}` : "none",
            }}
          >
            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
          </button>
        );
      })}
    </div>
  );
};
