// ==============================================================================
// JUDE CORE CONSTANTS & IDENTITY SYSTEM
// ==============================================================================

export const USER_NAME = "Vaita";
export const ASSISTANT_NAME = "Jude";
export const ASSISTANT_PRONUNCIATION = "Yud";
export const LANGUAGE = "es-ES";

export const THEME_COLORS = {
  background: "#030303",
  panel: "#0A0806",
  panelBorder: "rgba(255, 176, 32, 0.15)",
  core: "#FFF6E0",
  amber: "#FFB020",
  orange: "#FF7A1A",
  spark: "#FF3D1F",
  ghostBlue: "#2E5A88", // 10-15% opacidad
} as const;

export type AssistantState = "idle" | "listening" | "processing" | "speaking";

export interface ActionPayload {
  type: "email" | "calendar" | "system" | "none";
  title?: string;
  recipient?: string;
  subject?: string;
  body?: string;
  date?: string; // YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ
  details?: string;
  location?: string;
  command?: string;
  advancedExecuted?: boolean;
}
