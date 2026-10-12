import fs from "fs";
import path from "path";

// Directorio persistente de datos (montable en Docker)
const DATA_DIR = path.join(process.cwd(), "data");
const MEMORIES_FILE = path.join(DATA_DIR, "memories.json");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");
const CHAT_HISTORY_FILE = path.join(DATA_DIR, "chat_history.json");

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.error("[STORAGE] Error creando directorio data:", err);
  }
}

export interface NoteItem {
  id: string;
  text: string;
  date: string;
}

// ==================== MEMORIAS PERMANENTES ====================
export function getPermanentMemories(): string[] {
  ensureDataDir();
  try {
    if (fs.existsSync(MEMORIES_FILE)) {
      const raw = fs.readFileSync(MEMORIES_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("[STORAGE] Error leyendo memories.json:", err);
  }
  return [];
}

export function savePermanentMemory(newMemory: string): string[] {
  ensureDataDir();
  const current = getPermanentMemories();
  const trimmed = newMemory.trim();
  if (!trimmed || current.includes(trimmed)) return current;

  const updated = [...current, trimmed];
  try {
    fs.writeFileSync(MEMORIES_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("[STORAGE] Error guardando memoria:", err);
  }
  return updated;
}

export function deletePermanentMemory(memoryToDelete: string): string[] {
  ensureDataDir();
  const current = getPermanentMemories();
  const updated = current.filter((m) => m !== memoryToDelete);
  try {
    fs.writeFileSync(MEMORIES_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("[STORAGE] Error borrando memoria:", err);
  }
  return updated;
}

// ==================== NOTAS Y TAREAS ====================
export function getNotes(): NoteItem[] {
  ensureDataDir();
  try {
    if (fs.existsSync(NOTES_FILE)) {
      const raw = fs.readFileSync(NOTES_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("[STORAGE] Error leyendo notes.json:", err);
  }
  return [];
}

export function addNote(text: string): NoteItem[] {
  ensureDataDir();
  const current = getNotes();
  const trimmed = text.trim();
  if (!trimmed) return current;

  const newNote: NoteItem = {
    id: Date.now().toString(),
    text: trimmed,
    date: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
  };

  const updated = [newNote, ...current];
  try {
    fs.writeFileSync(NOTES_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("[STORAGE] Error guardando nota:", err);
  }
  return updated;
}

export function deleteNote(id: string): NoteItem[] {
  ensureDataDir();
  const current = getNotes();
  const updated = current.filter((n) => n.id !== id);
  try {
    fs.writeFileSync(NOTES_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("[STORAGE] Error borrando nota:", err);
  }
  return updated;
}

export function clearNotes(): NoteItem[] {
  ensureDataDir();
  try {
    fs.writeFileSync(NOTES_FILE, JSON.stringify([], null, 2), "utf-8");
  } catch (err) {}
  return [];
}

// ==================== HISTORIAL DE TELEGRAM ====================
export function getTelegramHistory(chatId: string | number): Array<{ role: "user" | "assistant"; content: string }> {
  ensureDataDir();
  try {
    if (fs.existsSync(CHAT_HISTORY_FILE)) {
      const raw = fs.readFileSync(CHAT_HISTORY_FILE, "utf-8");
      const allHistories = JSON.parse(raw);
      return allHistories[String(chatId)] || [];
    }
  } catch {}
  return [];
}

export function saveTelegramHistory(
  chatId: string | number,
  history: Array<{ role: "user" | "assistant"; content: string }>
) {
  ensureDataDir();
  try {
    let allHistories: Record<string, Array<{ role: "user" | "assistant"; content: string }>> = {};
    if (fs.existsSync(CHAT_HISTORY_FILE)) {
      allHistories = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, "utf-8"));
    }
    allHistories[String(chatId)] = history.slice(-20); // Mantener últimas 20 interacciones
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(allHistories, null, 2), "utf-8");
  } catch (err) {
    console.error("[STORAGE] Error guardando historial de Telegram:", err);
  }
}
