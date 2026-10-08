// ==============================================================================
// JUDE CORE CONSTANTS & IDENTITY SYSTEM
// ==============================================================================

export const USER_NAME = "Vaita";
export const ASSISTANT_NAME = "Jude";
export const ASSISTANT_PRONUNCIATION = "Yud";
export const LANGUAGE = "es-ES";

export type CoreTheme = "mark3" | "arc" | "combat" | "matrix" | "violet";

export interface ThemePalette {
  name: string;
  badge: string;
  primary: string;
  secondary: string;
  accent: string;
  spark: string;
  ghost: string;
  glow: string;
  border: string;
}

export const THEMES: Record<CoreTheme, ThemePalette> = {
  mark3: {
    name: "MARK III / STARK GOLD",
    badge: "GOLD_CORE",
    primary: "#FFF6E0",
    secondary: "#FFB020",
    accent: "#FF7A1A",
    spark: "#FF3D1F",
    ghost: "rgba(46, 90, 136, 0.22)",
    glow: "rgba(255, 176, 32, 0.4)",
    border: "rgba(255, 176, 32, 0.25)",
  },
  arc: {
    name: "ARC REACTOR / CYAN",
    badge: "ARC_CYAN",
    primary: "#E0F7FA",
    secondary: "#00E5FF",
    accent: "#00B0FF",
    spark: "#0091EA",
    ghost: "rgba(0, 150, 255, 0.22)",
    glow: "rgba(0, 229, 255, 0.4)",
    border: "rgba(0, 229, 255, 0.25)",
  },
  combat: {
    name: "COMBAT PROTOCOL / CRIMSON",
    badge: "ALERT_RED",
    primary: "#FFEBEE",
    secondary: "#FF1744",
    accent: "#D50000",
    spark: "#FF5252",
    ghost: "rgba(180, 0, 40, 0.22)",
    glow: "rgba(255, 23, 68, 0.45)",
    border: "rgba(255, 23, 68, 0.3)",
  },
  matrix: {
    name: "DIAGNOSTIC / EMERALD",
    badge: "BIO_GREEN",
    primary: "#E8F5E9",
    secondary: "#00E676",
    accent: "#00C853",
    spark: "#69F0AE",
    ghost: "rgba(0, 200, 83, 0.22)",
    glow: "rgba(0, 230, 118, 0.4)",
    border: "rgba(0, 230, 118, 0.25)",
  },
  violet: {
    name: "CYBER VOID / ULTRAVIOLET",
    badge: "VOID_PURPLE",
    primary: "#F3E5F5",
    secondary: "#E040FB",
    accent: "#D500F9",
    spark: "#AA00FF",
    ghost: "rgba(170, 0, 255, 0.22)",
    glow: "rgba(224, 64, 251, 0.4)",
    border: "rgba(224, 64, 251, 0.25)",
  },
};

export const THEME_COLORS = THEMES.mark3;

export type AssistantState = "idle" | "listening" | "processing" | "speaking";

export interface ActionPayload {
  type: "email" | "calendar" | "timer" | "note" | "weather" | "search" | "theme" | "ambient" | "system" | "none";
  title?: string;
  recipient?: string;
  subject?: string;
  body?: string;
  date?: string; // YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ
  details?: string;
  location?: string;
  // Temporizadores
  durationSeconds?: number;
  timerLabel?: string;
  // Notas
  noteContent?: string;
  noteAction?: "add" | "delete" | "clear" | "list";
  noteIndex?: number;
  // Clima
  weatherCity?: string;
  weatherTemp?: string;
  weatherCondition?: string;
  // Búsqueda en vivo
  searchQuery?: string;
  searchResults?: string;
  // Tema
  targetTheme?: CoreTheme;
  // Ruido ambiental
  ambientState?: boolean;
  // Comandos de sistema
  command?: string;
  advancedExecuted?: boolean;
}
