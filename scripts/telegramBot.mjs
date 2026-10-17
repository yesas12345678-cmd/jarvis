import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { runAutonomousCodingAgent, listProjectFiles, runTerminalCommand } from "./codingAgent.mjs";

// Cargar variables de entorno
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USER_ID = process.env.TELEGRAM_ALLOWED_USER_ID || "7777389793";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const USER_NAME = "Manuel (Vaita)";
const ASSISTANT_NAME = "Jude";

if (!BOT_TOKEN) {
  console.log("=================================================");
  console.log("ℹ️  TELEGRAM_BOT_TOKEN no está definido en .env.");
  console.log("=================================================");
  process.exit(0);
}

if (!GEMINI_API_KEY) {
  console.error("❌ ERROR: GEMINI_API_KEY no encontrada en .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Directorio de persistencia
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const MEMORIES_FILE = path.join(DATA_DIR, "memories.json");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");
const CHAT_HISTORY_FILE = path.join(DATA_DIR, "chat_history.json");
const ARCHIVE_FILE = path.join(DATA_DIR, "full_archive.json");

// Inicializar archivos si no existen
if (!fs.existsSync(MEMORIES_FILE)) fs.writeFileSync(MEMORIES_FILE, "[]", "utf-8");
if (!fs.existsSync(NOTES_FILE)) fs.writeFileSync(NOTES_FILE, "[]", "utf-8");
if (!fs.existsSync(CHAT_HISTORY_FILE)) fs.writeFileSync(CHAT_HISTORY_FILE, "{}", "utf-8");
if (!fs.existsSync(ARCHIVE_FILE)) fs.writeFileSync(ARCHIVE_FILE, "[]", "utf-8");

// ==========================================
// INTEGRACIÓN DINÁMICA CON COMPOSIO (@composio/core)
// ==========================================
let composio = null;
let composioSession = null;
let composioUserId = null;

const GMAIL_ACCOUNTS_MAP = {
  "yesas12345678@gmail.com": "ca_oJUXgzsFAz8_",
  "yesas": "ca_oJUXgzsFAz8_",
  "lopezserranojosemanuel20041@gmail.com": "ca_X4iCO1TKebhQ",
  "lopezserranojosemanuel2004@gmail.com": "ca_7z6g3H4f6-WK"
};
const DEFAULT_PRIMARY_GMAIL = "yesas12345678@gmail.com";
let lastDailyEmailReportDate = null;

const TOOLKIT_METADATA = {
  gmail: { name: "Gmail", icon: "📧", desc: "Gestión, lectura y envío de correos" },
  googlecalendar: { name: "Google Calendar", icon: "📅", desc: "Agenda, citas y eventos" },
  googledrive: { name: "Google Drive", icon: "📁", desc: "Almacenamiento y documentos en la nube" },
  googledocs: { name: "Google Docs", icon: "📄", desc: "Creación y edición de documentos" },
  elevenlabs: { name: "ElevenLabs", icon: "🎙️", desc: "Síntesis de voz ultra-realista y clonación" },
  reddit: { name: "Reddit", icon: "🤖", desc: "Comunidades, posts y tendencias" },
  discord: { name: "Discord", icon: "💬", desc: "Servidores, canales y mensajería" },
  googlesheets: { name: "Google Sheets", icon: "📊", desc: "Hojas de cálculo y tablas" },
  youtube: { name: "YouTube", icon: "📺", desc: "Búsqueda de videos, playlists y canal" },
  notion: { name: "Notion", icon: "📓", desc: "Páginas, notas y bases de conocimiento" },
  perplexityai: { name: "Perplexity AI", icon: "🔍", desc: "Búsqueda web avanzada e investigación" },
  supabase: { name: "Supabase", icon: "🗄️", desc: "Base de datos y backend relacional" },
  github: { name: "GitHub", icon: "🐙", desc: "Repositorios, ramas, issues y commits" },
};

let activeAppsList = [];
let lastSyncTime = 0;
let primaryGmailAddress = null;

async function syncConnectedApps(force = false) {
  if (!composio) return activeAppsList;
  const now = Date.now();
  if (!force && now - lastSyncTime < 25000 && activeAppsList.length > 0) {
    return activeAppsList;
  }

  try {
    let cursor = null;
    const allItems = [];
    do {
      const res = await composio.client.connectedAccounts.list({ cursor: cursor || undefined });
      if (res && res.items) {
        allItems.push(...res.items);
      }
      cursor = res?.next_cursor;
    } while (cursor);

    const seen = new Set();
    const list = [];

    for (const acc of allItems) {
      if (acc.status === "ACTIVE") {
        if (!composioUserId) composioUserId = acc.user_id;
        const slug = acc.toolkit?.slug?.toLowerCase() || "";

        if (slug && !seen.has(slug)) {
          seen.add(slug);
          const meta = TOOLKIT_METADATA[slug] || {
            name: acc.toolkit?.name || slug.toUpperCase(),
            icon: "⚡",
            desc: "Servicio conectado",
          };

          list.push({
            slug,
            name: meta.name,
            icon: meta.icon,
            desc: meta.desc,
            detail: slug === "gmail" ? primaryGmailAddress : null,
          });
        }
      }
    }

    activeAppsList = list;
    lastSyncTime = now;
  } catch (err) {
    console.warn("⚠️  [COMPOSIO] Error sincronizando apps activas:", err.message);
  }

  return activeAppsList;
}

async function initComposio() {
  if (!COMPOSIO_API_KEY) {
    console.log("ℹ️  [COMPOSIO] No se especificó COMPOSIO_API_KEY.");
    return;
  }

  try {
    const { Composio } = await import("@composio/core");
    composio = new Composio({ apiKey: COMPOSIO_API_KEY });

    // Sincronizar cuentas
    await syncConnectedApps(true);

    if (!composioUserId) {
      composioUserId = "pg-test-10ba854f-9c9f-4d58-bd34-57888a816003";
    }

    composioSession = await composio.create(composioUserId);

    // Obtener correo primario de Gmail si está activo
    const hasGmail = activeAppsList.some((a) => a.slug === "gmail");
    if (hasGmail) {
      try {
        const profile = await composioSession.execute("GMAIL_GET_PROFILE", {});
        if (profile?.data?.emailAddress) {
          primaryGmailAddress = profile.data.emailAddress;
          const gIndex = activeAppsList.findIndex((a) => a.slug === "gmail");
          if (gIndex !== -1) {
            activeAppsList[gIndex].detail = primaryGmailAddress;
          }
        }
      } catch {}
    }

    console.log("⚡ [COMPOSIO] Sesión iniciada con éxito.");
    console.log(`   Usuario: ${composioUserId}`);
    console.log(`   Integraciones activas (${activeAppsList.length}):`);
    for (const a of activeAppsList) {
      console.log(`   • ${a.icon} ${a.name} (${a.desc}${a.detail ? `: ${a.detail}` : ""})`);
    }
  } catch (err) {
    console.warn("⚠️  [COMPOSIO] Error inicializando SDK:", err.message);
  }
}

// Helpers de ejecución
async function getComposioGmailSession(accountIdentifier) {
  if (!composio) await initComposio();
  if (!composio) throw new Error("Composio no disponible.");
  let accId = "ca_oJUXgzsFAz8_";
  if (accountIdentifier) {
    const key = accountIdentifier.toLowerCase().trim();
    if (GMAIL_ACCOUNTS_MAP[key]) {
      accId = GMAIL_ACCOUNTS_MAP[key];
    } else if (key.includes("20041") || (key.includes("lopez") && key.includes("1"))) {
      accId = "ca_X4iCO1TKebhQ";
    } else if (key.includes("lopez") || key.includes("2004")) {
      accId = "ca_7z6g3H4f6-WK";
    }
  }
  return await composio.create(composioUserId || "pg-test-10ba854f-9c9f-4d58-bd34-57888a816003", {
    connectedAccounts: { gmail: accId }
  });
}

async function executeSendEmail(recipient, subject, body, targetAccount = null) {
  const session = await getComposioGmailSession(targetAccount || DEFAULT_PRIMARY_GMAIL);
  return await session.execute("GMAIL_SEND_EMAIL", {
    recipient_email: recipient,
    subject: subject || "Mensaje de Manuel",
    body: body || "",
  });
}

async function executeFetchEmails(maxResults = 5, query = "", targetAccount = null) {
  const session = await getComposioGmailSession(targetAccount || DEFAULT_PRIMARY_GMAIL);
  const params = { max_results: maxResults };
  if (query) params.query = query;
  return await session.execute("GMAIL_FETCH_EMAILS", params);
}

async function executeMoveEmailToTrash(messageId, targetAccount = null) {
  const session = await getComposioGmailSession(targetAccount || DEFAULT_PRIMARY_GMAIL);
  return await session.execute("GMAIL_MOVE_TO_TRASH", { message_id: messageId });
}

async function executeListCalendars() {
  if (!composioSession) throw new Error("Sesión de Composio no inicializada.");
  return await composioSession.execute("GOOGLECALENDAR_LIST_CALENDARS", {});
}

async function executeCreateCalendarEvent({
  summary,
  start,
  end,
  calendarId = "primary",
  description = "",
  isAllDay = false,
}) {
  if (!composioSession) throw new Error("Sesión de Composio no inicializada.");

  const payload = {
    calendar_id: calendarId || "primary",
    summary: summary || "Nuevo evento",
    create_meeting_room: false,
  };
  if (description) payload.description = description;

  if (isAllDay) {
    const startDateStr = typeof start === "string" && start.length === 10 ? start : getDayKey(start);
    let endDateStr = end ? (typeof end === "string" && end.length === 10 ? end : getDayKey(end)) : startDateStr;
    if (startDateStr === endDateStr) {
      const d = new Date(startDateStr);
      d.setDate(d.getDate() + 1);
      endDateStr = getDayKey(d);
    }
    payload.start_date = startDateStr;
    payload.end_date = endDateStr;
  } else {
    const startIso = (start instanceof Date ? start : new Date(start)).toISOString();
    let endIso;
    if (end) {
      endIso = (end instanceof Date ? end : new Date(end)).toISOString();
    } else {
      const d = new Date(startIso);
      d.setHours(d.getHours() + 1);
      endIso = d.toISOString();
    }
    payload.start_date_time = startIso;
    payload.end_date_time = endIso;
  }

  return await composioSession.execute("GOOGLECALENDAR_CREATE_EVENT", payload);
}

async function executeFindCalendarEvents({
  calendarId = "primary",
  query = "",
  timeMin,
  timeMax,
  maxResults = 25,
} = {}) {
  if (!composioSession) throw new Error("Sesión de Composio no inicializada.");
  const now = new Date();
  const payload = {
    calendar_id: calendarId || "primary",
    time_min: timeMin || now.toISOString(),
    time_max: timeMax || new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString(),
    single_events: true,
    max_results: maxResults,
  };
  if (query) payload.query = query;
  return await composioSession.execute("GOOGLECALENDAR_FIND_EVENT", payload);
}

async function executeDeleteCalendarEvent(eventId, calendarId = "primary") {
  if (!composioSession) throw new Error("Sesión de Composio no inicializada.");
  return await composioSession.execute("GOOGLECALENDAR_DELETE_EVENT", {
    calendar_id: calendarId || "primary",
    event_id: eventId,
  });
}

// ==========================================
// GESTIÓN DE EXÁMENES Y ESTUDIO EN GOOGLE CALENDAR
// ==========================================
function parseSpanishExamDate(str) {
  if (!str) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  const clean = str.trim().toLowerCase();
  const now = new Date();

  if (clean.includes("en una semana") || clean.includes("1 semana") || clean.includes("una semana")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  if (clean.includes("en dos semanas") || clean.includes("2 semanas") || clean.includes("dos semanas")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 14);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  if (clean.includes("mañana") && !clean.includes("pasado")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  if (clean.includes("pasado mañana")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  const daysOfWeek = {
    domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3,
    jueves: 4, viernes: 5, sabado: 6, sábado: 6
  };
  for (const [dayName, dayIndex] of Object.entries(daysOfWeek)) {
    if (clean.includes(dayName)) {
      const currentDay = now.getDay();
      let diff = dayIndex - currentDay;
      if (diff <= 0) diff += 7;
      const d = new Date(now);
      d.setDate(d.getDate() + diff);
      d.setHours(23, 59, 59, 999);
      return d;
    }
  }

  const months = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
  };
  const regexDate = /(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?/i;
  const match = clean.match(regexDate);
  if (match) {
    const day = parseInt(match[1], 10);
    const monthStr = match[2].toLowerCase();
    const year = match[3] ? parseInt(match[3], 10) : now.getFullYear();
    if (months[monthStr] !== undefined) {
      return new Date(year, months[monthStr], day, 23, 59, 59, 999);
    }
  }

  const isoMatch = clean.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10), 23, 59, 59, 999);
  }

  const slashMatch = clean.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    const year = slashMatch[3] ? parseInt(slashMatch[3], 10) : now.getFullYear();
    return new Date(year, month, day, 23, 59, 59, 999);
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 7);
  fallback.setHours(23, 59, 59, 999);
  return fallback;
}

function parseStudyHours(str) {
  if (!str) return 2;
  const s = String(str).toLowerCase().trim();
  if (s.includes("media hora")) return 0.5;
  if (s.includes("hora y media") || s.includes("1 hora y media")) return 1.5;
  if (s.includes("dos horas y media") || s.includes("2 horas y media")) return 2.5;
  if (s.includes("tres horas y media") || s.includes("3 horas y media")) return 3.5;
  if (s.includes("cuatro horas y media") || s.includes("4 horas y media")) return 4.5;
  const num = parseFloat(s.replace(/[^0-9.,]/g, "").replace(",", "."));
  return isNaN(num) || num <= 0 ? 2 : num;
}

function cleanSubjectName(str) {
  if (!str) return "Examen";
  let s = str.trim();
  s = s.replace(/^(examen\s+de|ex\.\s*de|ex\.|estudio\s+de|prueba\s+de)\s+/i, "");
  s = s.replace(/^(el\s+examen\s+de|el\s+de)\s+/i, "");
  return s.trim() || "Examen";
}

function getDayKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseFlexibleDateTime(str, defaultHour = 10) {
  if (!str) return { date: new Date(), hasTime: false, isAllDay: false };
  const raw = String(str).trim();
  const lower = raw.toLowerCase();
  const isAllDay = lower.includes("todo el d") || lower.includes("all day");

  // Si viene en formato ISO (YYYY-MM-DDTHH:mm o YYYY-MM-DD HH:mm)
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(raw)) {
    const d = new Date(raw.replace(" ", "T"));
    if (!isNaN(d.getTime())) return { date: d, hasTime: true, isAllDay };
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d, defaultHour, 0, 0);
    return { date: dateObj, hasTime: false, isAllDay: true };
  }

  // Buscar hora explícita: "18:30", "18h30", "18h", "6:30 pm", "a las 18:30"
  let hours = defaultHour;
  let minutes = 0;
  let hasTime = false;
  const timeRegex = /(?:a\s+las\s+|las\s+)?(\d{1,2})(?::|h)?(\d{2})?\s*(am|pm|h)?(?:\s|$)/i;
  const timeMatch = raw.match(timeRegex);
  let cleanedStr = raw;

  if (timeMatch && (timeMatch[0].includes(":") || timeMatch[0].includes("h") || timeMatch[0].includes("las") || timeMatch[3])) {
    hours = parseInt(timeMatch[1], 10);
    minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3]?.toLowerCase();
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    hasTime = true;
    cleanedStr = raw.replace(timeMatch[0], " ").trim();
  }

  const baseDate = parseSpanishExamDate(cleanedStr || raw);
  const resultDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hours, minutes, 0);
  return { date: resultDate, hasTime, isAllDay };
}

async function scheduleExamStudySlots({ materia, fechaExamenStr, horasRequeridas, chatId }) {
  if (!composioSession) {
    throw new Error("Sesión de Composio no inicializada.");
  }

  const cleanMateria = cleanSubjectName(materia);
  const targetHours = parseStudyHours(horasRequeridas);
  const examDate = parseSpanishExamDate(fechaExamenStr);
  const now = new Date();

  // El examen es en examDate; el estudio se agenda en los días previos
  const examDayStart = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate(), 0, 0, 0);

  console.log(`📅 [ESTUDIO EXAMEN] Agendando ${targetHours} días/horas para "${cleanMateria}" antes del examen ${examDayStart.toISOString()}`);

  const res = await composioSession.execute("GOOGLECALENDAR_FIND_EVENT", {
    calendar_id: "primary",
    time_min: now.toISOString(),
    time_max: new Date(examDayStart.getTime() + 24 * 3600 * 1000).toISOString(),
    single_events: true,
    max_results: 250,
  });

  const allItems = res?.data?.event_data?.event_data || res?.data?.items || [];
  const slotsByDay = {};

  for (const item of allItems) {
    const summary = (item.summary || "").trim().toLowerCase();
    // Excluir si ya tiene asignado un estudio o examen
    if (summary.startsWith("estudio") || summary.startsWith("examen") || summary.startsWith("ex.")) {
      continue;
    }

    const isGreen = item.colorId === "10";
    const isFreeGreenBlock = isGreen && (
      !summary ||
      summary === "no title" ||
      summary === "(sin título)" ||
      summary === "sin título" ||
      summary === "undefined" ||
      summary === "bloque libre" ||
      /^\d{1,2}:\d{2}/.test(summary)
    );

    if (isFreeGreenBlock) {
      const start = new Date(item.start?.dateTime || item.start?.date);
      const end = new Date(item.end?.dateTime || item.end?.date);

      // Comprobar que esté en el futuro y estrictamente antes de que empiece el día del examen
      if (start.getTime() > now.getTime() && start.getTime() < examDayStart.getTime()) {
        const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        if (durationHours > 0) {
          const dayKey = getDayKey(start);
          if (!slotsByDay[dayKey]) slotsByDay[dayKey] = [];
          slotsByDay[dayKey].push({
            id: item.id,
            start,
            end,
            durationHours,
            recurringEventId: item.recurringEventId,
          });
        }
      }
    }
  }

  // REGLA 1: En cada día disponible, elegir el cuadrante libre MÁS TEMPRANO
  // REGLA 2: Máximo 1 hora / 1 sesión al día (un único bloque por día)
  const bestSlotPerDay = {};
  for (const [dayKey, daySlots] of Object.entries(slotsByDay)) {
    daySlots.sort((a, b) => a.start.getTime() - b.start.getTime());
    bestSlotPerDay[dayKey] = daySlots[0];
  }

  const availableDays = Object.keys(bestSlotPerDay);

  // REGLA 3: Prioridad de días para esquivar fines de semana
  // Tier 1: Lunes a Jueves (lunes=1, martes=2, miércoles=3, jueves=4) -> Óptimo entre semana
  // Tier 2: Domingo (0) -> Primera opción de respaldo si faltan huecos entre semana
  // Tier 3: Sábado (6) -> Segunda opción de respaldo
  // Tier 4: Viernes (5) -> Última opción de respaldo
  const tier1MonThu = [];
  const tier2Sunday = [];
  const tier3Saturday = [];
  const tier4Friday = [];

  for (const dayKey of availableDays) {
    const [y, m, d] = dayKey.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dow = dateObj.getDay();

    if (dow >= 1 && dow <= 4) {
      tier1MonThu.push({ dayKey, date: dateObj, slot: bestSlotPerDay[dayKey] });
    } else if (dow === 0) {
      tier2Sunday.push({ dayKey, date: dateObj, slot: bestSlotPerDay[dayKey] });
    } else if (dow === 6) {
      tier3Saturday.push({ dayKey, date: dateObj, slot: bestSlotPerDay[dayKey] });
    } else if (dow === 5) {
      tier4Friday.push({ dayKey, date: dateObj, slot: bestSlotPerDay[dayKey] });
    }
  }

  // Ordenar dentro de cada tier hacia atrás (los más cercanos al examen primero para frescura de estudio)
  const sortByProximity = (arr) => arr.sort((a, b) => b.date.getTime() - a.date.getTime());
  sortByProximity(tier1MonThu);
  sortByProximity(tier2Sunday);
  sortByProximity(tier3Saturday);
  sortByProximity(tier4Friday);

  const selectedCandidates = [];

  // 1º Días entre semana (Lunes a Jueves)
  for (const item of tier1MonThu) {
    if (selectedCandidates.length >= targetHours) break;
    selectedCandidates.push(item);
  }

  // 2º Domingo si faltan huecos
  if (selectedCandidates.length < targetHours) {
    for (const item of tier2Sunday) {
      if (selectedCandidates.length >= targetHours) break;
      selectedCandidates.push(item);
    }
  }

  // 3º Sábado si aún faltan
  if (selectedCandidates.length < targetHours) {
    for (const item of tier3Saturday) {
      if (selectedCandidates.length >= targetHours) break;
      selectedCandidates.push(item);
    }
  }

  // 4º Viernes como última opción si aún faltan
  if (selectedCandidates.length < targetHours) {
    for (const item of tier4Friday) {
      if (selectedCandidates.length >= targetHours) break;
      selectedCandidates.push(item);
    }
  }

  // Si faltan huecos respecto a targetHours, buscar huecos verdes secundarios reales en los días ya seleccionados
  if (selectedCandidates.length < targetHours) {
    console.log(`📅 [ESTUDIO EXAMEN] Buscando huecos verdes secundarios reales en días disponibles...`);
    const usedIds = new Set(selectedCandidates.map(c => c.slot.id));
    for (const pool of [tier1MonThu, tier2Sunday, tier3Saturday, tier4Friday]) {
      for (const item of pool) {
        if (selectedCandidates.length >= targetHours) break;
        const extraSlots = (slotsByDay[item.dayKey] || []).filter(s => !usedIds.has(s.id));
        for (const s of extraSlots) {
          if (selectedCandidates.length >= targetHours) break;
          usedIds.add(s.id);
          selectedCandidates.push({
            dayKey: item.dayKey,
            date: item.date,
            slot: s,
          });
        }
      }
    }
  }

  // REGLA CRÍTICA: NUNCA inventar horas arbitrarias (como a las 14:00) ni fuera de los bloques verdes reales.
  // Si no hay suficientes bloques verdes disponibles antes del examen, se aprovechan todos los existentes.

  // Ordenar cronológicamente (de pasado a futuro) para asignar en orden
  selectedCandidates.sort((a, b) => a.date.getTime() - b.date.getTime());

  let hoursAllocated = 0;
  const assignedSlots = [];
  const studyTitle = `Estudio: Ex. ${cleanMateria}`;

  for (const item of selectedCandidates) {
    const slot = item.slot;
    try {
      if (item.isNew || !slot.id) {
        const createRes = await composioSession.execute("GOOGLECALENDAR_CREATE_EVENT", {
          calendar_id: "primary",
          summary: studyTitle,
          start_date_time: slot.start.toISOString(),
          end_date_time: slot.end.toISOString(),
          create_meeting_room: false,
        });
        const createdId = createRes?.data?.id || createRes?.data?.event_data?.id || `nuevo-${Math.random()}`;
        hoursAllocated += slot.durationHours;
        assignedSlots.push({
          id: createdId,
          start: slot.start,
          end: slot.end,
          durationHours: slot.durationHours,
        });
      } else {
        await composioSession.execute("GOOGLECALENDAR_PATCH_EVENT", {
          calendar_id: "primary",
          event_id: slot.id,
          summary: studyTitle,
          color_id: "9", // Blueberry / Estudio
        });

        hoursAllocated += slot.durationHours;
        assignedSlots.push({
          id: slot.id,
          start: slot.start,
          end: slot.end,
          durationHours: slot.durationHours,
        });
      }
    } catch (patchErr) {
      console.warn(`[CALENDAR_SLOT_WARN] Error asignando hueco ${slot.id}:`, patchErr.message);
    }
  }

  // REGLA 4: Registrar el examen como EVENTO DE TODO EL DÍA exclusivamente en el calendario oficial de Exámenes
  // (NUNCA se duplica en primary y NUNCA se agregan asistentes para evitar eventos punteados o duplicados)
  let examCreated = false;
  try {
    const examCalId = "d2e409d4411fa610161db0ab00ca3318344250ac9c4c1c794159086694f15f5e@group.calendar.google.com";
    const startDateStr = getDayKey(examDate);
    const nextDay = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate() + 1);
    const endDateStr = getDayKey(nextDay);

    // Comprobar si ya existe un examen para esta materia en la fecha indicada
    const existingExamRes = await composioSession.execute("GOOGLECALENDAR_FIND_EVENT", {
      calendar_id: examCalId,
      time_min: new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate() - 1).toISOString(),
      time_max: new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate() + 2).toISOString(),
      single_events: true,
      max_results: 20,
    });
    const existingList = existingExamRes?.data?.event_data?.event_data || existingExamRes?.data?.items || [];
    const alreadyExists = existingList.some(e => (e.summary || "").toLowerCase().includes(cleanMateria.toLowerCase()));

    if (!alreadyExists) {
      await composioSession.execute("GOOGLECALENDAR_CREATE_EVENT", {
        calendar_id: examCalId,
        summary: `Examen: ${cleanMateria}`,
        start_date: startDateStr,
        end_date: endDateStr,
        create_meeting_room: false,
      });
      console.log(`📅 [EXAMEN] Creado examen oficial de "${cleanMateria}" en calendario Exámenes (${startDateStr})`);
    } else {
      console.log(`📅 [EXAMEN] El examen de "${cleanMateria}" ya existe en el calendario Exámenes. Evitando duplicado.`);
    }

    examCreated = true;
  } catch (examErr) {
    console.warn(`[EXAM_CREATE_WARN]`, examErr.message);
  }

  // Actualizar Segundo Cerebro (Obsidian) de forma autónoma
  try {
    const pc = await getPcStatus();
    if (pc.online) {
      const noteContent = `# Plan de Estudio: [[Examen ${cleanMateria}]]\n\n` +
        `- **Materia:** [[${cleanMateria}]]\n` +
        `- **Fecha del Examen:** ${examDate.toLocaleDateString("es-ES")} (Todo el día)\n` +
        `- **Sesiones Asignadas:** ${assignedSlots.length} días (máx 1h diaria)\n` +
        `- **Horas Totales:** ${hoursAllocated.toFixed(1)}h / ${targetHours}h solicitadas\n` +
        `- **Estrategia:** Entre semana (L-J prioritario, esquivando fin de semana)\n` +
        `- **Horario diario:** Cuadrante libre más temprano de cada día\n` +
        `- **Modo:** Ocurrencia única semanal ("para solo una vez", semanas siguientes intactas)\n\n` +
        `## Sesiones Agendadas\n` +
        assignedSlots.map(s => `- [[${s.start.toLocaleDateString("es-ES")}]] de ${s.start.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} a ${s.end.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} (${s.durationHours}h)`).join("\n") +
        `\n\n---\n*Generado automáticamente por [[Jude]] y [[Antigravity]]*`;

      await sendPcObsidianNote("Estudios", `Plan_${cleanMateria.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, "_")}.md`, noteContent);
    }
  } catch (obsidianErr) {
    console.warn("[OBSIDIAN_SYNC_WARN]:", obsidianErr.message);
  }

  return {
    success: true,
    materia: cleanMateria,
    examDate,
    hoursAllocated,
    targetHours,
    assignedSlots,
    examCreated,
  };
}

function formatStudyScheduleReport(result) {
  if (!result.success) {
    return `⚠️ *No se pudieron agendar las horas de estudio*\n\n${result.message}`;
  }

  const { materia, examDate, hoursAllocated, targetHours, assignedSlots } = result;
  const examDateStr = examDate.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const slotsList = assignedSlots.map(s => {
    const dia = s.start.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });
    const hInicio = s.start.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const hFin = s.end.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return `• *${dia.charAt(0).toUpperCase() + dia.slice(1)}:* \`${hInicio} - ${hFin}\` (${s.durationHours}h) → \`Estudio: Ex. ${materia}\``;
  }).join("\n");

  return `📅 *Plan de Estudio Agendado en Google Calendar*\n\n` +
    `• *Materia:* *${materia}*\n` +
    `• *Fecha del Examen:* *${examDateStr}* (Evento de *Todo el Día*)\n` +
    `• *Sesiones:* *${assignedSlots.length} días* (máx. 1 sesión diaria, lo más temprano posible)\n` +
    `• *Horas totales:* *${hoursAllocated.toFixed(1)}h* (${targetHours}h solicitadas)\n` +
    `• *Estrategia:* ✅ _Prioridad entre semana (L-J), esquivando fines de semana_\n` +
    `• *Aislamiento semanal:* ✅ _Modificación de ocurrencia única ("solo para una vez", semanas futuras intactas en verde)_\n\n` +
    `📋 *Bloques de estudio asignados (más tempranos de cada día):*\n${slotsList}\n\n` +
    `_Ficha y seguimiento registrados en tu [[Segundo Cerebro]]. ¡A por el examen, Manuel!_`;
}

// =====================================================================
// GESTIÓN INTELIGENTE DE CORREO: LIMPIEZA DE SPAM, RESUMEN Y CRON 7:00 AM
// =====================================================================
const PROTECTED_SENDERS = [
  "gitguardian", "github", "dokploy", "netlify", "vercel", "stripe",
  "payoneer", "bbva", "santander", "caixa", "revolut", "banco",
  "google", "apple", "microsoft", "antigravity", "examen", "universidad"
];

function isLikelySpamEmail(msg) {
  const sender = (msg.sender || "").toLowerCase();
  const subject = (msg.subject || "").toLowerCase();
  const labels = msg.labelIds || [];

  for (const prot of PROTECTED_SENDERS) {
    if (sender.includes(prot) || subject.includes(prot)) {
      return false;
    }
  }

  if (labels.includes("SPAM") || labels.includes("CATEGORY_PROMOTIONS")) {
    return true;
  }

  const spamKeywords = [
    "aliexpress", "temu", "shein", "descuento", "oferta", "rebajas",
    "promoción", "promocion", "newsletter", "unsubscribe", "stories-recap",
    "superdeal", "cupón", "cupon", "marketing"
  ];
  return spamKeywords.some(kw => sender.includes(kw) || subject.includes(kw));
}

async function cleanSpamAndSummarizeGmail({ targetChatId = TELEGRAM_ALLOWED_USER_ID, isScheduled = false } = {}) {
  const accountsToScan = [
    { email: "yesas12345678@gmail.com", role: "Desarrollo / Principal" },
    { email: "lopezserranojosemanuel20041@gmail.com", role: "Personal" }
  ];

  const allImportant = [];
  const allSpam = [];
  const trashedItems = [];

  for (const acc of accountsToScan) {
    try {
      const session = await getComposioGmailSession(acc.email);
      const res = await session.execute("GMAIL_FETCH_EMAILS", { max_results: 15, query: "is:unread" });
      const messages = res?.data?.messages || [];

      for (const m of messages) {
        if (isLikelySpamEmail(m)) {
          allSpam.push({
            account: acc.email,
            id: m.messageId,
            sender: m.sender || "Desconocido",
            subject: m.subject || "Sin asunto"
          });
          try {
            await session.execute("GMAIL_MOVE_TO_TRASH", { message_id: m.messageId });
            trashedItems.push(`${m.sender || "Desconocido"} (${m.subject || "Sin asunto"})`);
          } catch (trashErr) {
            console.warn(`[GMAIL TRASH WARN] Error al mover a papelera ${m.messageId}:`, trashErr.message);
          }
        } else {
          const preview = m.preview?.body?.slice(0, 180) || (m.messageText ? m.messageText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 180) : "");
          allImportant.push({
            account: acc.email,
            role: acc.role,
            id: m.messageId,
            sender: m.sender || "Desconocido",
            subject: m.subject || "Sin asunto",
            preview
          });
        }
      }
    } catch (accErr) {
      console.warn(`[GMAIL SCAN WARN] Error escaneando ${acc.email}:`, accErr.message);
    }
  }

  const prompt = `Eres Jude, el asistente personal de alta gama de Manuel.
${isScheduled ? "Son exactamente las 7:00 AM en España (Madrid) y le entregas su reporte matutino programado." : "Manuel te ha solicitado una revisión y limpieza de sus correos."}
Analiza los datos reales recibidos y redacta un informe ejecutivo conciso, refinado y directo.

REGLAS ESTRICTAS DE VERACIDAD:
1. NUNCA inventes correos que no estén en la lista. Si no hay correos importantes, dilo con total transparencia.
2. Agrupa por bloques útiles:
   - 🛡️ Alertas Técnicas y Seguridad (GitGuardian, Netlify, Dokploy, GitHub, etc.)
   - 💳 Finanzas y Servicios (Bancos, Payoneer, Stripe, suscripciones)
   - 🎓 Universidad, Exámenes y Personal
   - 📬 Otras Comunicaciones
3. Informa de la limpieza de spam:
   - 🗑️ Limpieza de Spam: Detalla cuántos correos promocionales fueron movidos a la papelera (${trashedItems.length} eliminados).

DATOS REALES RECIBIDOS:
CORREOS IMPORTANTES (${allImportant.length}):
${JSON.stringify(allImportant, null, 2)}

SPAM ELIMINADO (${trashedItems.length}):
${trashedItems.slice(0, 6).join("\n") || "Ninguno en esta ocasión."}
`;

  let reportText = null;
  const modelsToTry = [
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3-flash-preview",
    "gemini-2.5-flash"
  ];

  for (const modName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modName });
      const aiRes = await model.generateContent(prompt);
      reportText = aiRes.response.text();
      if (reportText) break;
    } catch (e) {
      console.warn(`[GEMINI SUMMARY WARN] Modelo ${modName} falló:`, e.message);
    }
  }

  if (!reportText) {
    const impList = allImportant.length > 0
      ? allImportant.map(m => `• *${m.sender}*: *${m.subject}*\n  _${m.preview}_`).join("\n\n")
      : "• No hay correos importantes pendientes en tu bandeja de entrada.";
    reportText = `☕ *Buenos días, Manuel. Reporte Ejecutivo de Correo (07:00)*\n\n` +
      `📬 *Correos Relevantes:*\n${impList}\n\n` +
      `🗑️ *Limpieza de Spam:* Se han detectado y movido a la papelera *${trashedItems.length}* correos publicitarios.`;
  }

  if (targetChatId) {
    await sendTextMessage(targetChatId, reportText);
  }

  // Registrar en Segundo Cerebro (Obsidian)
  try {
    const pc = await getPcStatus();
    if (pc.online) {
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const obsidianContent = `# Reporte Ejecutivo de Correo - ${dateStr}\n\n` +
        `**Hora:** 07:00 (Europe/Madrid)\n` +
        `**Estado:** Procesado y filtrado automáticamente por [[Jude]]\n\n` +
        `---\n\n` +
        `${reportText}\n\n` +
        `---\n*Registro automático del Asistente [[Jude]] para [[Manuel]]*`;
      await sendPcObsidianNote("01 - Registros/Correos", `Reporte_Gmail_${dateStr}.md`, obsidianContent);
    }
  } catch (obsErr) {
    console.warn("[OBSIDIAN SAVE WARN]", obsErr.message);
  }

  return reportText;
}

// Temporizador Cron Diario a las 07:00 AM Europe/Madrid
function checkScheduledTasks() {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
    const madridDate = `${parts.year}-${parts.month}-${parts.day}`;
    const hour = parseInt(parts.hour, 10);
    const minute = parseInt(parts.minute, 10);

    if (hour === 7 && minute === 0 && lastDailyEmailReportDate !== madridDate) {
      lastDailyEmailReportDate = madridDate;
      console.log(`⏰ [CRON 7:00 AM] Disparando revisión matutina de Gmail y limpieza de spam para ${madridDate}...`);
      cleanSpamAndSummarizeGmail({
        targetChatId: TELEGRAM_ALLOWED_USER_ID,
        isScheduled: true
      }).catch(err => {
        console.error("❌ [CRON ERROR] Fallo en rutina 7:00 AM:", err);
      });
    }
  } catch (cronErr) {
    console.error("⚠️ [CRON CHECK ERROR]:", cronErr.message);
  }
}
setInterval(checkScheduledTasks, 30000);

// Helpers de control remoto del PC
async function getPcStatus() {
  try {
    const res = await fetch("http://localhost:3001/api/pc-bridge");
    if (res.ok) {
      const data = await res.json();
      if (data.completed && data.completed.length > 0) {
        for (const item of data.completed) {
          if (item.summary) {
            sendTextMessage(ALLOWED_USER_ID, item.summary).catch(() => {});
          }
        }
      }
      return data;
    }
  } catch {}
  return { online: false, lastSeen: null, hostname: "PC-Manuel", secondsAgo: null, pendingCommands: 0, unreadProgress: [], completed: [], proyectos: [], activeApps: [] };
}

// Listener continuo de resultados de comandos asíncronos en el PC
let isPollingBridge = false;
async function listenPcBridgeEvents() {
  if (isPollingBridge) return;
  isPollingBridge = true;
  try {
    const res = await fetch("http://localhost:3001/api/pc-bridge");
    if (res.ok) {
      const data = await res.json();
      if (data.completed && data.completed.length > 0) {
        for (const item of data.completed) {
          if (item.summary) {
            console.log(`[PC BRIDGE COMPLETION] Enviando a Telegram:`, item.summary.slice(0, 80));
            await sendTextMessage(ALLOWED_USER_ID, item.summary);
          }
        }
      }
      if (data.unreadProgress && data.unreadProgress.length > 0) {
        for (const p of data.unreadProgress) {
          if (p.message) {
            await sendTextMessage(ALLOWED_USER_ID, `⏳ ${p.message}`);
          }
        }
      }
    }
  } catch {}
  finally {
    isPollingBridge = false;
  }
}
setInterval(listenPcBridgeEvents, 2500);

async function sendPcCommand(action, delaySeconds = 0, taskPrompt = null, extra = {}) {
  try {
    const res = await fetch("http://localhost:3001/api/pc-bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "command", action, delaySeconds, taskPrompt, ...extra }),
    });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

async function sendPcCodeTask(taskPrompt) {
  return await sendPcCommand("code_task", 0, taskPrompt);
}

async function sendPcListDir(targetPath = "C:\\PROYECTOS") {
  return await sendPcCommand("list_dir", 0, null, { path: targetPath });
}

async function sendPcTerminalCmd(command) {
  return await sendPcCommand("run_pc_cmd", 0, null, { command });
}

async function sendPcReadFile(filePath) {
  return await sendPcCommand("read_file", 0, null, { path: filePath });
}

async function sendPcWriteFile(filePath, content) {
  return await sendPcCommand("write_file", 0, null, { path: filePath, content });
}

async function sendPcObsidianNote(folder, filename, content, mode = "write") {
  return await sendPcCommand("obsidian_note", 0, null, { folder, filename, content, mode });
}

// Helper para llamadas a Telegram
async function callTelegram(method, params = {}) {
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch (err) {
    console.error(`[TELEGRAM] Error llamando a ${method}:`, err.message);
    return null;
  }
}

// Helper para descargar archivos multimedia de Telegram (fotos, notas de voz, audios)
async function downloadTelegramFile(fileId) {
  try {
    const fileInfo = await callTelegram("getFile", { file_id: fileId });
    if (!fileInfo || !fileInfo.ok || !fileInfo.result?.file_path) {
      console.warn("[TELEGRAM FILE] No se pudo obtener la ruta del archivo:", fileInfo);
      return null;
    }
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`;
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      console.warn(`[TELEGRAM FILE] Error HTTP ${res.status} al descargar ${downloadUrl}`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      buffer,
      base64: buffer.toString("base64"),
      filePath: fileInfo.result.file_path,
    };
  } catch (err) {
    console.error("[TELEGRAM FILE ERROR]:", err.message);
    return null;
  }
}

// Helpers de almacenamiento persistente
function getMemories() {
  try {
    if (fs.existsSync(MEMORIES_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORIES_FILE, "utf-8"));
    }
  } catch {}
  return [];
}

function saveMemory(text) {
  try {
    const current = getMemories();
    const cleanText = text.trim();
    if (cleanText && !current.includes(cleanText)) {
      const updated = [...current, cleanText];
      fs.writeFileSync(MEMORIES_FILE, JSON.stringify(updated, null, 2), "utf-8");
      console.log(`[MEMORIA REGISTRADA] "${cleanText}"`);
    }
  } catch (err) {
    console.error("[STORAGE ERROR] Guardando memoria:", err);
  }
}

function getNotes() {
  try {
    if (fs.existsSync(NOTES_FILE)) {
      return JSON.parse(fs.readFileSync(NOTES_FILE, "utf-8"));
    }
  } catch {}
  return [];
}

function addNote(text) {
  try {
    const current = getNotes();
    const newNote = {
      id: Date.now().toString(),
      text: text.trim(),
      date: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
    };
    const updated = [newNote, ...current];
    fs.writeFileSync(NOTES_FILE, JSON.stringify(updated, null, 2), "utf-8");
    console.log(`[NOTA REGISTRADA] "${text.trim()}"`);
    return updated;
  } catch (err) {
    console.error("[STORAGE ERROR] Añadiendo nota:", err);
    return [];
  }
}

function getHistory(chatId) {
  try {
    if (fs.existsSync(CHAT_HISTORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, "utf-8"));
      return data[String(chatId)] || [];
    }
  } catch {}
  return [];
}

function saveHistory(chatId, history, lastUserMsg = null, lastAiReply = null) {
  try {
    let data = {};
    if (fs.existsSync(CHAT_HISTORY_FILE)) {
      try {
        data = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, "utf-8"));
      } catch {}
    }
    data[String(chatId)] = history.slice(-50);
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(data, null, 2), "utf-8");

    if (lastUserMsg && lastAiReply) {
      let archive = [];
      if (fs.existsSync(ARCHIVE_FILE)) {
        try {
          archive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf-8"));
        } catch {}
      }
      archive.push({
        date: new Date().toISOString(),
        user: lastUserMsg,
        assistant: lastAiReply,
      });
      fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive, null, 2), "utf-8");
    }
  } catch (err) {
    console.error("[STORAGE ERROR] Guardando historial:", err);
  }
}

// Inferencia con Gemini SDK (admite texto, imágenes y audio/voz)
async function askJudeBrain(userMessage, chatId, toolContext = "", mediaPart = null) {
  await syncConnectedApps();

  const memories = getMemories();
  const history = getHistory(chatId);

  const activeAppsSummary = activeAppsList.length > 0
    ? activeAppsList.map((a, i) => `${i + 1}. ${a.icon} ${a.name} (${a.desc}${a.detail ? `: ${a.detail}` : ""})`).join("\n")
    : "• Conexiones en proceso de inicialización.";

  const pc = await getPcStatus();
  const pcProyectosList = (pc.proyectos && pc.proyectos.length > 0)
    ? pc.proyectos.map(p => `• ${p}`).join("\n")
    : "• Consultando sincronización con el puente local.";

  let antigravitySummary = "• Antigravity en reposo o sin sesión activa reciente detectada.";
  if (pc.antigravity) {
    const ag = pc.antigravity;
    antigravitySummary = `• Misión activa de Antigravity: "${ag.lastGoal}" (hace ${ag.minutesAgo} min)\n• Última acción técnica: ${ag.lastAction}`;
  }

  let gitActivitySummary = "• Consultando estado de repositorios locales...";
  if (pc.gitActivity && pc.gitActivity.length > 0) {
    gitActivitySummary = pc.gitActivity.map(g => {
      const dirty = g.clean ? "Limpio" : `${g.dirtyCount} archivos modificados`;
      return `• [${g.name}] Rama: "${g.branch}" (${dirty}) | Último commit: ${g.commit} - "${g.commitMsg}" (${g.commitTime})`;
    }).join("\n");
  }

  let pcActiveAppsSummary = "• No hay aplicaciones principales abiertas detectadas.";
  if (pc.activeApps && pc.activeApps.length > 0) {
    pcActiveAppsSummary = pc.activeApps.map(a => `• ${a}`).join("\n");
  }

  const nowMadrid = new Date().toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "full",
    timeStyle: "medium",
  });

  const systemInstruction = `
Eres ${ASSISTANT_NAME}, el asistente de inteligencia artificial personal de alta gama al servicio exclusivo de ${USER_NAME}.
Tienes control total y enlace de ejecución directo con el ordenador personal de ${USER_NAME} (${pc.hostname || "WIN-CM7ASU1D27L"}).
- FECHA Y HORA ACTUAL DE MANUEL (TIEMPO REAL EN ESPAÑA/MADRID): ${nowMadrid}

CONTROL DIRECTO DE SU ORDENADOR Y AJUSTES DE WINDOWS (JUDE PC BRIDGE):
- Estado actual de su PC en casa: ${pc.online ? `🟢 ENCENDIDO Y EN LÍNEA (${pc.hostname || "WIN-CM7ASU1D27L"})` : "🔴 APAGADO / HIBERNANDO"}
- SÍ TIENES ACCESO COMPLETO a sus archivos locales, carpetas, terminal y AJUSTES del sistema de su ordenador en tiempo real mediante el puente Jude PC Bridge.
- SÍ PUEDES MODIFICAR AJUSTES DE SU ORDENADOR (pantalla, sonido, volumen, modo oscuro/claro, energía, aplicaciones, red, etc.) ejecutando comandos de PowerShell o lanzando paneles de configuración mediante [ACCION_PC_CMD: comando].
- NUNCA le digas a Manuel que "estás en un VPS remoto", que "no puedes tocar ajustes de su ordenador", que "no puedes abrir interfaces", ni le pidas que copie y pegue comandos manualmente en su terminal. ¡Tú mismo ejecutas los comandos en su ordenador usando [ACCION_PC_CMD: ...], él no tiene que teclear nada!

TELEMETRÍA EN TIEMPO REAL DE ANTIGRAVITY Y PROYECTOS EN EL PC (DATOS VERIFICADOS):
${antigravitySummary}

APLICACIONES Y PROGRAMAS ABIERTOS EN LA PANTALLA DE SU PC AHORA MISMO:
${pcActiveAppsSummary}

ESTADO DE REPOSITORIOS Y RAMAS ACTIVAS EN C:\\PROYECTOS:
${gitActivitySummary}

REGLA INQUEBRANTABLE DE VERACIDAD SOBRE ANTIGRAVITY, VENTANAS Y RAMAS DE GIT:
- Si Manuel te pregunta en qué está trabajando Antigravity, qué hace, en qué proyecto está o en qué ramas está operando:
  UTILIZA EXCLUSIVAMENTE los datos reales de la telemetría anterior.
  ESTRICTAMENTE PROHIBIDO inventar nombres de ramas ficticias (como "fix/security-cleanup" o similares) o inventar tareas que no aparezcan en la telemetría.
  Si Antigravity está trabajando en una tarea, dila tal cual. Si una rama es "main", di "main". Si no hay actividad en un repositorio, dilo claramente.
- Si Manuel te pregunta qué tiene abierto en su ordenador, qué ventanas tiene abiertas o qué programas están en pantalla:
  MENCIONA EXCLUSIVAMENTE las aplicaciones detectadas en la lista anterior (ej: ${pc.activeApps && pc.activeApps.length > 0 ? pc.activeApps.join(", ") : "Google Chrome, Antigravity IDE"}). No inventes otras aplicaciones ni digas que necesitas ejecutar un comando para saberlo, ¡ya lo tienes en tu telemetría directa!

CAPACIDADES MULTIMODAL:
- Puedes ver, analizar y describir con total precisión cualquier imagen o captura de pantalla que Manuel te envíe.
- Puedes escuchar y responder a mensajes de audio y notas de voz que te envíe.
- Responde de forma natural y conversacional tanto al texto como a lo que observes o escuches.

PERSONALIDAD & TRATO:
- Impecable, sofisticada, leal, eficiente y concisa.
- Dirígete a él como Manuel o Vaita.
- TIENES MEMORIA CONTINUA: Conoces perfectamente todo lo que te ha dicho previamente en este chat y tus respuestas anteriores.

INTEGRACIONES REALES Y HERRAMIENTAS ACTIVAS CONECTADAS EN COMPOSIO (${activeAppsList.length} ACTIVAS):
${activeAppsSummary}

CONOCIMIENTO PLENO DE TUS HERRAMIENTAS:
- Tienes acceso directo y activo a TODAS estas herramientas en tu sistema.
- Si Manuel te pregunta qué herramientas o integraciones tienes conectadas, MENCIONA TODAS las que aparecen en la lista anterior (incluyendo YouTube, Google Docs, Drive, Perplexity AI, Supabase, Google Sheets, Notion, GitHub, Calendar, Gmail).
- Nunca digas que solo tienes 2 o 3 si la lista tiene ${activeAppsList.length}. Conoces y dispones de todas ellas.

REGLAS DE OPERACIÓN:
1. Recuerda todos los datos personales que te diga Manuel.
2. Si Manuel te revela un dato nuevo (ej: "tengo novia", "mi trabajo es..."), CONFÍRMASELO brevemente y añade al final de tu respuesta: [MEMORIA: dato exacto en 3-6 palabras].
3. Si te pide anotar algo, añade: [NOTA: texto de la nota].
4. ACCIONES REALES DE CORREO:
   - Si Manuel te ordena enviar un correo a alguien, extrae los parámetros e incluye al final: [ACCION_EMAIL: destinatario@correo.com | Asunto | Contenido].
   - Si te pide revisar o buscar correos específicos (ej: "mira el de GitGuardian", "mira los de yesas", "qué correos tengo"):
     Añade: [ACCION_LEER_EMAILS: query="..." | account="yesas12345678@gmail.com"].
     * Cuentas de Manuel:
       1. yesas12345678@gmail.com (Desarrollo, GitHub, GitGuardian, Dokploy, Netlify).
       2. lopezserranojosemanuel20041@gmail.com (Personal y académico).
   - Si te pide limpiar el spam y resumir sus correos o ejecutar la revisión matutina:
     Añade: [ACCION_RESUMEN_GMAIL].
   - ESTRICTAMENTE PROHIBIDO inventar o simular correos: el sistema consulta la API real y devuelve los datos verídicos.

4.1. GESTIÓN AUTÓNOMA DE CITAS Y EVENTOS EN GOOGLE CALENDAR:
   - Tienes control TOTAL sobre Google Calendar de Manuel (${primaryGmailAddress || "yesas12345678@gmail.com"}).
   - Si Manuel te pide agendar cualquier cita personal, médica, estética, reunión, evento o recordatorio (ej: "cita para el entrecejo el viernes a las 18:30", "apúntame dentista mañana a las 11:00", "cena el sábado a las 21:00", etc.):
     * Extrae: Título | Inicio | Fin_o_duracion | Calendario
     * Añade SIEMPRE la etiqueta al final:
       [ACCION_CALENDARIO_CREAR: Titulo | Inicio | Fin_o_duracion | Calendario]
       (Ejemplos: [ACCION_CALENDARIO_CREAR: Cita entrecejo | 2026-10-16 18:30 | 1h | primary], [ACCION_CALENDARIO_CREAR: Dentista | mañana a las 10:00 | 1h | primary]).
     * Si no especifica duración, por defecto pon "1h". Si es de todo el día, pon "todo el dia".
   - Si Manuel te pregunta por sus citas, eventos o qué tiene en su agenda:
     * Añade SIEMPRE al final: [ACCION_CALENDARIO] o [ACCION_CALENDARIO_LISTAR: hoy | 7 dias] para que el sistema consulte Google Calendar en tiempo real y muestre los eventos reales confirmados.
   - Si Manuel te pide borrar una cita:
     * Añade: [ACCION_CALENDARIO_BORRAR: EventId | primary].
   - PROHIBIDO ABSOLUTAMENTE DECIRLE A MANUEL QUE HAS AGENDADO UNA CITA SIN INCLUIR LA ETIQUETA [ACCION_CALENDARIO_CREAR: ...]. Si no incluyes la etiqueta, el sistema no la guardará y será una alucinación falsa.
5. NUNCA digas que te falta la API key de Composio: YA LA TIENES y las integraciones están activas en tiempo real.
6. ROL CLAVE EN DESARROLLO Y PROGRAMACIÓN:
   - Tú eres el Chief of Staff y Orquestador Supremo. Tú NO programas código directamente ni pretendes programar software por tu cuenta.
   - Para programar, escribir código, refactorizar, editar archivos de desarrollo o compilar proyectos, SIEMPRE necesitas y delegas en ANTIGRAVITY (el motor y agente de programación local).
   - Cuando Manuel te hable de programar o crear funciones, orquesta la estrategia y déjale claro que la implementación técnica en código se la asignas a Antigravity usando [ACCION_PC_CODE: tarea].

7. CONTROL TOTAL DE ARCHIVOS, AJUSTES Y APPS EN EL PC:
   - ABRIR APLICACIONES DIRECTAMENTE EN SU PANTALLA ("abre gemini", "abre la aplicación de gemini", "pero que la vea yo", "abre obsidian", "abre notion", "abre chrome"):
     * Para abrir Google Gemini (su app nativa de escritorio): añade SIEMPRE [ACCION_PC_CMD: Start-Process explorer.exe "C:\\Users\\yesas\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Gemini.lnk"] o [ACCION_ABRIR_APP: Gemini]
     * ¡NUNCA ejecutes simplemente "start https://gemini.google.com" si te pide la aplicación de Gemini! Abre su aplicación nativa de escritorio para que se despliegue visiblemente en su monitor.
     * Para abrir páginas web o URLs en el navegador: añade [ACCION_PC_CMD: Start-Process chrome.exe "https://..."]
     * Para abrir Obsidian: añade [ACCION_PC_CMD: Start-Process explorer.exe "C:\\Users\\yesas\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Obsidian.lnk"] o [ACCION_ABRIR_APP: Obsidian]
     * Para abrir Notion: añade [ACCION_PC_CMD: Start-Process explorer.exe "C:\\Users\\yesas\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Notion.lnk"] o [ACCION_ABRIR_APP: Notion]
     * O usa la etiqueta directa: [ACCION_ABRIR_APP: nombre_app] (ej: [ACCION_ABRIR_APP: Gemini]).
   - Modificar ajustes de Windows, volumen, pantalla o sistema: añade [ACCION_PC_CMD: comando] (ej: [ACCION_PC_CMD: start ms-settings:display] o [ACCION_PC_CMD: powershell Set-ItemProperty ...]).
   - Ver o leer un archivo de su PC: añade [ACCION_LEER_ARCHIVO: ruta_completa].
   - Crear o editar un archivo en su PC: añade [ACCION_EDITAR_ARCHIVO: ruta_completa | contenido].
   - Ejecutar cualquier comando en su consola: añade [ACCION_PC_CMD: comando].
   - Registrar nota en Segundo Cerebro (Obsidian): añade [ACCION_OBSIDIAN: carpeta | titulo | contenido].

8. PROHIBIDO ALUCINAR O SIMULAR EJECUCIÓN (REGLA DE VERACIDAD ABSOLUTA):
   - NUNCA inventes porcentajes de progreso falsos (como "60%", "90%", "100%"). Si no hay un proceso técnico cuantificado corriendo, di la verdad.
   - NUNCA inventes enlaces web, URLs de despliegue o confirmaciones ficticias de sitios publicados si no has recibido una respuesta real verificada de la API.
   - NUNCA afirmes que has registrado una cita o evento en Google Calendar sin usar [ACCION_CALENDARIO_CREAR: ...] o [ACCION_AGENDAR_ESTUDIO: ...].
   - Si se te pide desarrollar una web o proyecto, NO finjas que lo estás haciendo mentalmente: asigna la tarea técnica real a Antigravity con [ACCION_PC_CODE: ...] o di claramente que necesitas confirmación para lanzar el proceso real.

9. GESTIÓN Y AGENDADO DE ESTUDIO PARA EXÁMENES EN GOOGLE CALENDAR:
   - Tienes acceso activo y directo a Google Calendar de Manuel (${primaryGmailAddress || "yesas12345678@gmail.com"}).
   - Manuel tiene bloques libres verdes sin título ("No title") en su calendario Time Blocking.
   - Cuando Manuel te mencione que tiene un examen (ej: "tengo examen de [Materia] el [Fecha] y quiero estudiar [X] horas", "tengo examen este día y quiero estudiar tantas horas", o en audio/nota de voz):
     1. Extrae: la Materia, la Fecha del examen y las Horas de estudio deseadas.
     2. Añade SIEMPRE al final de tu respuesta la etiqueta de acción:
        [ACCION_AGENDAR_ESTUDIO: Materia | Fecha_del_examen | Horas]
        (Ejemplos: [ACCION_AGENDAR_ESTUDIO: Lengua | en una semana | 4], [ACCION_AGENDAR_ESTUDIO: Matemáticas | 20 de octubre | 3.5]).
      3. Explícale a Manuel con tu tono refinado y eficiente las reglas aplicadas:
         - Creas un evento de TODO EL DÍA exclusivamente en el calendario oficial de 'Exámenes', nunca en 'Time Blocking' y sin duplicados ni asistentes.
         - El estudio se agenda ÚNICAMENTE dentro de sus bloques verdes libres reales (colorId: 10).
         - ESTRICTAMENTE PROHIBIDO inventar horas fuera de sus bloques verdes (como a las 14:00, que es horario de instituto/comida ocupado en marrón).
         - Distribuyes el estudio a máximo 1 hora diaria en días distintos antes del examen.
         - Priorizas días entre semana (Lunes a Jueves) esquivando fines de semana (si faltan días: 1º Domingo, 2º Sábado, 3º Viernes).
         - En cada día escoges el cuadrante libre más temprano posible.
         - Se modifica ÚNICAMENTE esa semana ('para solo una vez'), dejando todas las semanas futuras intactas en verde.

${toolContext ? `INFORMACIÓN DE HERRAMIENTAS EJECUTADAS EN VIVO:\n${toolContext}\n` : ""}

BASE DE MEMORIAS PERMANENTES ACTUALES DE MANUEL:
${memories.length > 0 ? memories.map((m) => `• ${m}`).join("\n") : "• Ninguna registrada todavía."}
`;

  const formattedContents = [];
  let lastRole = null;

  for (const h of history) {
    const role = h.role === "assistant" ? "model" : "user";
    if (role !== lastRole) {
      formattedContents.push({
        role,
        parts: [{ text: h.content }],
      });
      lastRole = role;
    }
  }

  const userParts = [];
  if (mediaPart) {
    userParts.push(mediaPart);
  }
  userParts.push({ text: userMessage });

  if (lastRole === "user") {
    formattedContents[formattedContents.length - 1].parts.push(...userParts);
  } else {
    formattedContents.push({
      role: "user",
      parts: userParts,
    });
  }

  const availableModels = [
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
  ];
  let lastError = null;
  const maxAttempts = 2;
  const exhaustedModels = new Set();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const modelName of availableModels) {
      if (exhaustedModels.has(modelName)) continue;
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction,
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 8192,
          },
        });

        // Timeout de 20 segundos por intento para permitir tiempo de razonamiento y respuesta completa
        const generatePromise = model.generateContent({ contents: formattedContents });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout en ${modelName}`)), 20000)
        );

        const result = await Promise.race([generatePromise, timeoutPromise]);
        const reply = result.response.text();
        if (reply) return reply;
      } catch (err) {
        lastError = err;
        console.warn(`[GEMINI_WARN] (Intento ${attempt}/${maxAttempts}) Fallo con ${modelName}:`, err.message);
        // Si el modelo da 404 o 429 (cuota diaria), excluirlo de reintentos
        if (err.status === 404 || err.status === 429) {
          exhaustedModels.add(modelName);
          continue;
        }
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  // Fallback de emergencia usando banco de memorias si la API está momentáneamente saturada
  const lowerMsg = userMessage.toLowerCase();
  if (lowerMsg.includes("novia") || lowerMsg.includes("pareja")) {
    const noviaMem = memories.find((m) => m.toLowerCase().includes("novia"));
    if (noviaMem) {
      return `Tu novia es Aleida, Manuel. La tengo bien presente en mis recuerdos.`;
    }
  }

  throw lastError || new Error("No se pudo obtener respuesta de Gemini tras reintentos");
}

// Envío a Telegram con fallback automático a texto plano si falla Markdown
async function sendTextMessage(chatId, text) {
  const res = await callTelegram("sendMessage", {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown",
  });

  if (!res || !res.ok) {
    return await callTelegram("sendMessage", {
      chat_id: chatId,
      text: text,
    });
  }
  return res;
}

// Bucle principal de Long Polling
async function startPolling() {
  await initComposio();

  console.log("=================================================");
  console.log(`🤖 [JUDE TELEGRAM BOT] Núcleo activo y escuchando.`);
  console.log(`   Asistente: ${ASSISTANT_NAME} // Usuario: ${USER_NAME}`);
  console.log(`   ID Autorizado: ${ALLOWED_USER_ID}`);
  console.log(`   Memoria persistente: ACTIVA en ${DATA_DIR}`);
  console.log("=================================================");

  let offset = 0;
  let wasPcOnline = null;
  let pcOfflineSince = null;
  let pcOfflineAlertSent = false;

  while (true) {
    try {
      // Supervisión de estado del PC (alertas automáticas de desconexión y reconexión)
      try {
        const pcState = await getPcStatus();

        if (pcState.online) {
          if (wasPcOnline === false) {
            // El PC ha recuperado la conexión tras un corte o apagado
            const reconnectMsg = `🟢 *¡Tu ordenador ha vuelto a conectarse con éxito!*\n\n` +
              `• *Host:* \`${pcState.hostname}\`\n` +
              `• *Estado:* Corriente y conexión restablecidas.\n` +
              `• *Puente:* Listo para recibir órdenes y tareas de desarrollo.`;
            await sendTextMessage(ALLOWED_USER_ID, reconnectMsg);
          }
          wasPcOnline = true;
          pcOfflineSince = null;
          pcOfflineAlertSent = false;
        } else {
          // PC sin señal
          if (wasPcOnline === true) {
            if (!pcOfflineSince) {
              pcOfflineSince = Date.now();
            } else if (Date.now() - pcOfflineSince > 75000 && !pcOfflineAlertSent) {
              // Ha pasado más de 1 minuto sin recibir latido de vida del PC
              const disconnectMsg = `⚠️ *[ALERTA DE DESCONEXIÓN]*\n\n` +
                `Manuel, he dejado de recibir señal de tu ordenador en casa hace más de 1 minuto.\n\n` +
                `• *Posibles causas:* Corte de luz/corriente eléctrica, caída de la red WiFi o apagado.\n` +
                `• *Estado de Jude:* Mi núcleo en la nube sigue 100% activo y te avisaré de inmediato en cuanto vuelva la corriente y tu PC arranque.`;
              await sendTextMessage(ALLOWED_USER_ID, disconnectMsg);
              pcOfflineAlertSent = true;
              wasPcOnline = false;
            }
          } else if (wasPcOnline === null) {
            wasPcOnline = false;
          }
        }

        // Reenviar avances o tareas completadas desde el PC en casa a Telegram
        if (pcState.unreadProgress && pcState.unreadProgress.length > 0) {
          for (const p of pcState.unreadProgress) {
            await sendTextMessage(ALLOWED_USER_ID, p.message);
          }
        }
        if (pcState.completed && pcState.completed.length > 0) {
          for (const c of pcState.completed) {
            const isPlain = c.summary.startsWith("📄") || c.summary.startsWith("💻") || c.summary.startsWith("✅") || c.summary.startsWith("🧠") || c.summary.startsWith("⚠️") || c.summary.startsWith("📂");
            const finalMsg = isPlain ? c.summary : `🏁 *[DESARROLLO EN TU PC FINALIZADO]*\n\n${c.summary}`;
            await sendTextMessage(ALLOWED_USER_ID, finalMsg);
          }
        }
      } catch (monitorErr) {
        console.warn("[PC_MONITOR_WARN]:", monitorErr.message);
      }
      const updates = await callTelegram("getUpdates", {
        offset: offset,
        timeout: 25,
      });

      if (updates && updates.ok && updates.result) {
        for (const update of updates.result) {
          offset = update.update_id + 1;

          if (!update.message) continue;

          const msg = update.message;
          const chatId = msg.chat.id;
          const senderId = String(msg.from.id);
          let userText = (msg.text || msg.caption || "").trim();
          let mediaPart = null;

          // 1. Detección y descarga de imágenes / fotos
          if (msg.photo && msg.photo.length > 0) {
            const bestPhoto = msg.photo[msg.photo.length - 1];
            callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
            const fileData = await downloadTelegramFile(bestPhoto.file_id);
            if (fileData) {
              mediaPart = {
                inlineData: {
                  data: fileData.base64,
                  mimeType: "image/jpeg",
                },
              };
              if (!userText) {
                userText = "Analiza y describe esta imagen en detalle y responde con lo que observes o se solicite.";
              }
            }
          }

          // 2. Detección y descarga de notas de voz
          if (msg.voice) {
            callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
            const fileData = await downloadTelegramFile(msg.voice.file_id);
            if (fileData) {
              mediaPart = {
                inlineData: {
                  data: fileData.base64,
                  mimeType: "audio/ogg",
                },
              };
              if (!userText) {
                userText = "Escucha atentamente este mensaje de audio/nota de voz y respóndeme con claridad.";
              }
            }
          }

          // 3. Detección y descarga de archivos de audio
          if (msg.audio) {
            callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
            const fileData = await downloadTelegramFile(msg.audio.file_id);
            if (fileData) {
              mediaPart = {
                inlineData: {
                  data: fileData.base64,
                  mimeType: msg.audio.mime_type || "audio/mp3",
                },
              };
              if (!userText) {
                userText = "Escucha este archivo de audio y procesa su contenido.";
              }
            }
          }

          if (!userText && !mediaPart) continue;

          console.log(`[TELEGRAM] Mensaje de ${msg.from.first_name || "Manuel"} (${senderId}): "${userText}" ${mediaPart ? `[MULTIMEDIA: ${mediaPart.inlineData.mimeType}]` : ""}`);

          // Comprobación de seguridad
          if (ALLOWED_USER_ID && senderId !== String(ALLOWED_USER_ID)) {
            console.warn(`[SEGURIDAD] Rechazado mensaje de ${senderId}: ${userText}`);
            await sendTextMessage(
              chatId,
              `⛔ *Acceso Denegado*\n\nEste núcleo de inteligencia artificial pertenece exclusivamente a *${USER_NAME}*.`
            );
            continue;
          }

          // Encolar mensaje en la cola secuencial (FIFO)
          enqueueUserMessage({
            chatId,
            senderId,
            userText,
            mediaPart,
          });
        }
      }
    } catch (loopErr) {
      console.error("[POLLING ERROR] Reintentando en 3s:", loopErr.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// ==========================================
// COLA DE MENSAJES SECUENCIAL (FIFO)
// ==========================================
const userMessageQueue = [];
let isQueueProcessing = false;

function enqueueUserMessage(item) {
  userMessageQueue.push(item);
  console.log(`📥 [COLA TELEGRAM] Mensaje encolado (${userMessageQueue.length} pendientes): "${(item.userText || "").slice(0, 40)}"`);
  callTelegram("sendChatAction", { chat_id: item.chatId, action: "typing" });
  processMessageQueue();
}

async function processMessageQueue() {
  if (isQueueProcessing) return;
  isQueueProcessing = true;

  while (userMessageQueue.length > 0) {
    const item = userMessageQueue.shift();
    try {
      callTelegram("sendChatAction", { chat_id: item.chatId, action: "typing" });
      await handleUserMessage(item);
    } catch (err) {
      console.error("[QUEUE_DISPATCH_ERROR]:", err);
    }

    if (userMessageQueue.length > 0) {
      callTelegram("sendChatAction", { chat_id: item.chatId, action: "typing" });
      // Cooldown de 600ms entre mensajes para evitar rate limits
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  isQueueProcessing = false;
}

async function handleUserMessage({ chatId, senderId, userText, mediaPart }) {
  callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });

  if (userText.startsWith("/programar_en_pc ") || userText.startsWith("/pc_code ")) {
    const prompt = userText.replace(/^\/(programar_en_pc|pc_code)\s+/, "").trim();
    if (prompt) {
      const pc = await getPcStatus();
      if (!pc.online) {
        await sendTextMessage(chatId, `🔴 *Tu PC en casa está APAGADO.*\nPara programar este proyecto en el servidor VPS, escribe: \`/programar ${prompt}\``);
      } else {
        await sendPcCodeTask(prompt);
        await sendTextMessage(
          chatId,
          `🚀 *Orden enviada a tu PC en casa*\n\n🎯 *Objetivo:* _${prompt}_\n\nTu ordenador ha tomado el control y está programando el proyecto. Te iré notificando cada avance aquí en directo.`
        );
      }
    }
    return;
  }

  // COMANDOS RÁPIDOS
  if (userText.startsWith("/estudio ") || userText.startsWith("/agendar_estudio ")) {
    const raw = userText.replace(/^\/(estudio|agendar_estudio)\s+/, "").trim();
    const parts = raw.split("|");
    const materia = parts[0]?.trim();
    const fecha = parts[1]?.trim() || "en una semana";
    const horas = parts[2]?.trim() || "2";
    if (materia) {
      callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
      try {
        const report = await scheduleExamStudySlots({ materia, fechaExamenStr: fecha, horasRequeridas: horas, chatId });
        await sendTextMessage(chatId, formatStudyScheduleReport(report));
      } catch (err) {
        await sendTextMessage(chatId, `⚠️ Error agendando estudio: ${err.message}`);
      }
      return;
    }
  }

  if (userText === "/calendario" || userText === "/citas" || userText === "/agenda") {
    callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
    try {
      const eventsRes = await executeFindCalendarEvents({
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        maxResults: 20,
      });
      const items = eventsRes?.data?.event_data?.event_data || eventsRes?.data?.items || [];
      const validItems = items.filter(it => it.summary && it.summary !== "undefined" && it.summary !== "no title" && it.summary !== "(sin título)");
      if (validItems.length > 0) {
        const list = validItems.map(it => {
          const startStr = it.start?.dateTime || it.start?.date;
          const d = new Date(startStr);
          const day = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
          const time = it.start?.dateTime ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "Todo el día";
          return `• *${day}* \`${time}\` — *${it.summary}*`;
        }).join("\n");
        await sendTextMessage(chatId, `📅 *Eventos en Google Calendar (Próximos 7 días):*\n\n${list}`);
      } else {
        await sendTextMessage(chatId, `📅 *Google Calendar:* No tienes eventos ni citas registradas en los próximos 7 días.`);
      }
    } catch (err) {
      await sendTextMessage(chatId, `⚠️ Error consultando Google Calendar: ${err.message}`);
    }
    return;
  }

  if (userText.startsWith("/cita ") || userText.startsWith("/crear_cita ")) {
    const raw = userText.replace(/^\/(cita|crear_cita)\s+/, "").trim();
    const parts = raw.split("|");
    const summary = parts[0]?.trim();
    const fechaHora = parts[1]?.trim();
    const duracion = parts[2]?.trim();
    if (summary && fechaHora) {
      callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
      try {
        const { date: startDate, hasTime, isAllDay } = parseFlexibleDateTime(fechaHora, 18);
        let endDate;
        if (duracion && !isAllDay) {
          const durMatch = duracion.match(/(\d+(?:\.\d+)?)\s*(?:h|hora)/i);
          const durHours = durMatch ? parseFloat(durMatch[1]) : 1;
          endDate = new Date(startDate.getTime() + durHours * 3600 * 1000);
        } else if (!isAllDay) {
          endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
        }
        await executeCreateCalendarEvent({
          summary,
          start: startDate,
          end: endDate,
          calendarId: "primary",
          isAllDay,
        });
        const dateFormatted = startDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
        const timeFormatted = isAllDay ? "Todo el día" : `${startDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} - ${endDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
        await sendTextMessage(chatId, `📅 *Cita registrada en Google Calendar:*\n• *Evento:* *${summary}*\n• *Fecha:* ${dateFormatted}\n• *Horario:* \`${timeFormatted}\``);
      } catch (err) {
        await sendTextMessage(chatId, `⚠️ Error creando cita: ${err.message}`);
      }
      return;
    }
  }

  if (userText === "/start" || userText === "/ayuda") {
    const welcome = `⚡ *Núcleo JUDE Activo // Enlace Telegram*\n\n` +
      `Hola, *${USER_NAME}*. Estoy conectado y listo para responder a tus órdenes incluso con tu ordenador apagado.\n\n` +
      `*Control de tu PC Remoto:*\n` +
      `• \`/pc\` — Ver si tu ordenador está encendido o hibernando.\n` +
      `• \`/hibernar\` o \`/apagar_pc\` — Hibernar de inmediato (conserva todas tus ventanas y apps sin cerrar nada).\n` +
      `• \`/hibernar_en <min>\` — Programar hibernación en X minutos (ej: \`/hibernar_en 30\`).\n` +
      `• \`/cancelar_apagado\` — Cancelar cualquier apagado o hibernación en curso.\n` +
      `• \`/apagar_total\` — Apagado tradicional completo (cerrando programas).\n\n` +
      `*Estudio & Google Calendar:*\n` +
      `• \`/estudio <materia> | <fecha> | <horas>\` — Agendar bloques de estudio en huecos libres de Google Calendar.\n\n` +
      `*Desarrollo & Herramientas:*\n` +
      `• \`/programar <tarea>\` — Desarrollo de proyectos autónomo.\n` +
      `• \`/herramientas\` — Ver las ${activeAppsList.length} integraciones activas.\n` +
      `• \`/proyectos\` — Archivos en tu workspace.\n` +
      `• \`/notas\` — Ver y crear notas.\n` +
      `• \`/memoria\` — Ver lo que recuerdo sobre ti.\n\n` +
      `_¿En qué puedo asistirte hoy?_`;
    await sendTextMessage(chatId, welcome);
    return;
  }

  if (userText === "/pc" || userText === "/estado_pc") {
    const pc = await getPcStatus();
    if (pc.online) {
      const msg = `🟢 *Tu ordenador está ENCENDIDO y en línea*\n\n` +
        `• *Host:* \`${pc.hostname}\`\n` +
        `• *Conexión:* Activa (hace ${pc.secondsAgo || 1}s)\n` +
        `• *Comandos pendientes:* ${pc.pendingCommands}\n\n` +
        `_Puedes hibernarlo con \`/hibernar\` o \`/apagar_pc\` (conserva todas tus ventanas y apps sin cerrar nada), o programarlo con \`/hibernar_en <minutos>\`._`;
      await sendTextMessage(chatId, msg);
    } else {
      const msg = `🔴 *Tu ordenador está APAGADO / HIBERNANDO*\n\n` +
        `• *Última conexión:* ${pc.lastSeen ? new Date(pc.lastSeen).toLocaleTimeString("es-ES") : "Sin registro hoy"}\n\n` +
        `_En el siguiente paso configuraremos el encendido remoto desde el móvil._`;
      await sendTextMessage(chatId, msg);
    }
    return;
  }

  if (userText === "/apagar_pc" || userText === "/hibernar" || userText === "/hibernar_pc") {
    const pc = await getPcStatus();
    if (!pc.online) {
      await sendTextMessage(chatId, `⚠️ Tu ordenador ya figura como *APAGADO / HIBERNANDO*.`);
    } else {
      await sendPcCommand("hibernate", 10);
      await sendTextMessage(
        chatId,
        `💤 *Orden de hibernación enviada a tu PC*\n\nTu ordenador entrará en *hibernación en 10 segundos*.\n\n✨ *No se cerrará nada:* Todo tu trabajo, pestañas, ventanas y editores quedarán guardados intactos.\nSi deseas cancelarlo, escribe rápidamente \`/cancelar_apagado\`.`
      );
    }
    return;
  }

  if (userText.startsWith("/apagar_pc_en ") || userText.startsWith("/hibernar_en ")) {
    const minStr = userText.replace(/^\/(apagar_pc_en|hibernar_en)\s+/, "").trim();
    const min = parseInt(minStr, 10);
    if (isNaN(min) || min <= 0) {
      await sendTextMessage(chatId, `⚠️ Indica un número de minutos válido. Ejemplo: \`/hibernar_en 30\``);
    } else {
      const sec = min * 60;
      await sendPcCommand("hibernate", sec);
      await sendTextMessage(
        chatId,
        `⏳ *Hibernación programada*\n\nTu ordenador hibernará automáticamente en *${min} minutos* (conservando todas tus ventanas abiertas).\nPara cancelarlo, escribe \`/cancelar_apagado\`.`
      );
    }
    return;
  }

  if (userText === "/apagar_total" || userText === "/apagar_completo") {
    const pc = await getPcStatus();
    if (!pc.online) {
      await sendTextMessage(chatId, `⚠️ Tu ordenador ya figura como *APAGADO*.`);
    } else {
      await sendPcCommand("shutdown", 10);
      await sendTextMessage(
        chatId,
        `🛑 *Apagado completo enviado a tu PC*\n\nTu ordenador se apagará por completo (cerrando aplicaciones) en *10 segundos*.\nPara cancelar: \`/cancelar_apagado\`.`
      );
    }
    return;
  }

  if (userText === "/cancelar_apagado" || userText === "/cancelar_hibernacion") {
    await sendPcCommand("cancel_shutdown");
    await sendTextMessage(chatId, `✅ *Apagado / hibernación cancelada con éxito.* Tu ordenador seguirá activo.`);
    return;
  }

  if (userText.startsWith("/code ") || userText.startsWith("/programar ")) {
    const prompt = userText.replace(/^\/(code|programar)\s+/, "").trim();
    if (prompt) {
      const pc = await getPcStatus();
      if (pc.online) {
        await sendPcCodeTask(prompt);
        await sendTextMessage(
          chatId,
          `🚀 *[ANTIGRAVITY EN TU PC]* Tarea asignada a tu ordenador.\n\n🎯 *Objetivo:* _${prompt}_\n\n💻 Ejecutando con el SDK de Antigravity en tu entorno local. Te iré reportando el progreso aquí en directo.`
        );
      } else {
        await sendTextMessage(
          chatId,
          `💻 *Tu PC está apagado.* Iniciando desarrollo en el servidor VPS de respaldo...\n\n🎯 *Objetivo:* _${prompt}_`
        );
        try {
          const summary = await runAutonomousCodingAgent({
            taskPrompt: prompt,
            geminiApiKey: GEMINI_API_KEY,
            composioSession,
            onProgress: async (update) => {
              await sendTextMessage(chatId, update);
            },
          });
          await sendTextMessage(chatId, `🏁 *Desarrollo Finalizado con Éxito*\n\n${summary}`);
        } catch (agentErr) {
          await sendTextMessage(chatId, `⚠️ *Error durante el desarrollo:* ${agentErr.message}`);
        }
      }
    }
    return;
  }

  if (userText === "/proyectos" || userText === "/archivos" || userText === "/carpetas" || userText === "/pc_carpetas") {
    const pc = await getPcStatus();
    if (pc.online && pc.proyectos && pc.proyectos.length > 0) {
      const list = pc.proyectos.map((p) => `📁 \`${p}\``).join("\n");
      await sendTextMessage(chatId, `📂 *Carpetas en tu PC (\`C:\\PROYECTOS\` — ${pc.proyectos.length} proyectos):*\n\n${list}`);
    } else if (pc.online) {
      await sendPcListDir("C:\\PROYECTOS");
      await sendTextMessage(chatId, `🔍 Consultando directorio \`C:\\PROYECTOS\` en tu PC...`);
    } else {
      const res = listProjectFiles();
      if (!res.success || res.files.length === 0) {
        await sendTextMessage(chatId, `📂 *Workspace de Proyectos*\n\nTu PC está apagado y no hay archivos en el VPS todavía.`);
      } else {
        const list = res.files.map((f) => `• ${f.type === "dir" ? "📁" : "📄"} \`${f.path}\` ${f.size ? `_(${f.size} B)_` : ""}`).slice(0, 35).join("\n");
        await sendTextMessage(chatId, `📂 *Archivos en Workspace VPS (${res.files.length}):*\n\n${list}`);
      }
    }
    return;
  }

  if (userText.startsWith("/pc_terminal ")) {
    const cmd = userText.replace("/pc_terminal ", "").trim();
    if (cmd) {
      const pc = await getPcStatus();
      if (!pc.online) {
        await sendTextMessage(chatId, `🔴 Tu PC está apagado. No se puede ejecutar \`${cmd}\`.`);
      } else {
        await sendPcTerminalCmd(cmd);
        await sendTextMessage(chatId, `💻 *Comando enviado a la consola de tu PC:* \`${cmd}\`...`);
      }
    }
    return;
  }

  if (userText.startsWith("/leer ")) {
    const filePath = userText.replace("/leer ", "").trim();
    if (filePath) {
      const pc = await getPcStatus();
      if (!pc.online) {
        await sendTextMessage(chatId, `🔴 Tu PC está apagado. No se puede leer \`${filePath}\`.`);
      } else {
        await sendPcReadFile(filePath);
        await sendTextMessage(chatId, `🔍 *Leyendo archivo en tu PC:* \`${filePath}\`...`);
      }
    }
    return;
  }

  if (userText.startsWith("/editar ")) {
    const raw = userText.replace("/editar ", "").trim();
    const parts = raw.split("|");
    const filePath = parts[0]?.trim();
    const content = parts.slice(1).join("|")?.trim();
    if (filePath && content !== undefined) {
      const pc = await getPcStatus();
      if (!pc.online) {
        await sendTextMessage(chatId, `🔴 Tu PC está apagado. No se puede editar \`${filePath}\`.`);
      } else {
        await sendPcWriteFile(filePath, content);
        await sendTextMessage(chatId, `✏️ *Guardando cambios en tu PC:* \`${filePath}\`...`);
      }
    } else {
      await sendTextMessage(chatId, `⚠️ Formato: \`/editar ruta_archivo | nuevo contenido\``);
    }
    return;
  }

  if (userText.startsWith("/terminal ")) {
    const cmd = userText.replace("/terminal ", "").trim();
    if (cmd) {
      const res = await runTerminalCommand(cmd);
      const output = (res.stdout || res.stderr || "(sin salida)").trim().slice(0, 1000);
      await sendTextMessage(chatId, `💻 *Comando (VPS):* \`${cmd}\`\n*Código:* ${res.code}\n\`\`\`\n${output}\n\`\`\``);
    }
    return;
  }

  if (userText === "/herramientas") {
    await syncConnectedApps(true);
    const list = activeAppsList.length > 0
      ? activeAppsList.map((a, i) => `${i + 1}. ${a.icon} *${a.name}* — ${a.desc}${a.detail ? ` (\`${a.detail}\`)` : ""}`).join("\n")
      : "No se detectaron integraciones activas en este momento.";

    const statusMsg = `🛠️ *Integraciones activas de Jude en Composio (${activeAppsList.length})*:\n\n${list}\n\n` +
      `_Todas las herramientas están sincronizadas en vivo con tu cuenta de Composio y listas para usarse._`;
    await sendTextMessage(chatId, statusMsg);
    return;
  }

  if (userText === "/notas") {
    const notes = getNotes();
    if (notes.length === 0) {
      await sendTextMessage(chatId, `📝 *Notas de ${USER_NAME}*\n\nNo tienes notas activas en este momento.`);
    } else {
      const list = notes.map((n, i) => `${i + 1}. ${n.text} _(${n.date})_`).join("\n");
      await sendTextMessage(chatId, `📝 *Notas activas de ${USER_NAME}:*\n\n${list}`);
    }
    return;
  }

  if (userText.startsWith("/anotar ")) {
    const noteContent = userText.replace("/anotar ", "").trim();
    if (noteContent) {
      addNote(noteContent);
      await sendTextMessage(chatId, `✅ *Nota registrada con éxito:*\n"${noteContent}"`);
    }
    return;
  }

  if (userText === "/memoria") {
    const memories = getMemories();
    if (memories.length === 0) {
      await sendTextMessage(chatId, `🧠 *Memoria permanente de Jude*\n\nAún no hay recuerdos guardados.`);
    } else {
      const list = memories.map((m, i) => `• ${m}`).join("\n");
      await sendTextMessage(chatId, `🧠 *Recuerdos permanentes aprendidos sobre ti:*\n\n${list}`);
    }
    return;
  }

  if (userText === "/limpiar") {
    saveHistory(chatId, []);
    await sendTextMessage(chatId, `🧹 *Contexto reiniciado.* Listo para una nueva conversación.`);
    return;
  }

  // DETECCIÓN EN LENGUAJE NATURAL DE TAREAS DE PROGRAMACIÓN AUTÓNOMA
  const lowerText = userText.toLowerCase();
  const isCodingRequest =
    (lowerText.startsWith("programa ") ||
     lowerText.startsWith("crea un script ") ||
     lowerText.startsWith("crea un proyecto ") ||
     lowerText.startsWith("crea un bot ") ||
     lowerText.startsWith("desarrolla un ") ||
     lowerText.startsWith("haz un script ") ||
     lowerText.startsWith("haz un bot ")) &&
    !lowerText.includes("cómo ") &&
    !lowerText.includes("que es ");

  if (isCodingRequest) {
    await sendTextMessage(chatId, `🚀 *Modo Agente Programador Activado*\n\n🎯 *Petición detectada:* _${userText}_\n\nIniciando desarrollo autónomo en el servidor VPS...`);
    try {
      const summary = await runAutonomousCodingAgent({
        taskPrompt: userText,
        geminiApiKey: GEMINI_API_KEY,
        composioSession,
        onProgress: async (update) => {
          await sendTextMessage(chatId, update);
        },
      });
      await sendTextMessage(chatId, `🏁 *Desarrollo Finalizado con Éxito*\n\n${summary}`);
    } catch (agentErr) {
      await sendTextMessage(chatId, `⚠️ *Error durante el desarrollo:* ${agentErr.message}`);
    }
    return;
  }

  // ATENCIÓN PROACTIVA A CORREOS O CALENDARIO PREVIO
  let toolContext = "";

  const lower = userText.toLowerCase();

  // Interceptar solicitud directa de limpieza de spam o resumen diario de correo
  if (
    lower === "/resumen_correos" || lower === "/correos" ||
    ((lower.includes("spam") || lower.includes("limpia")) && (lower.includes("correo") || lower.includes("gmail") || lower.includes("bandeja") || lower.includes("email"))) ||
    (lower.includes("resumen") && (lower.includes("correo") || lower.includes("gmail") || lower.includes("email")) && (lower.includes("hoy") || lower.includes("7") || lower.includes("mañana") || lower.includes("día") || lower.includes("dia")))
  ) {
    try {
      callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
      await cleanSpamAndSummarizeGmail({ targetChatId: chatId, isScheduled: false });
      return;
    } catch (err) {
      await sendTextMessage(chatId, `⚠️ Hubo un inconveniente al procesar tus correos: ${err.message}`);
      return;
    }
  }

  // Consulta puntual de correos en Gmail (GitGuardian, GitHub, búsqueda específica)
  if (
    (lower.includes("correo") || lower.includes("email") || lower.includes("gmail") || lower.includes("gitguardian") || lower.includes("dokploy") || lower.includes("netlify")) &&
    (lower.includes("mira") || lower.includes("lee") || lower.includes("revisa") || lower.includes("qué") || lower.includes("que") || lower.includes("tengo") || lower.includes("dime")) &&
    !lower.includes("mándale") && !lower.includes("envía") && !lower.includes("manda")
  ) {
    try {
      callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
      let queryTerm = "";
      let targetAcc = DEFAULT_PRIMARY_GMAIL;

      if (lower.includes("gitguardian")) queryTerm = "GitGuardian";
      else if (lower.includes("github")) queryTerm = "GitHub";
      else if (lower.includes("dokploy")) queryTerm = "Dokploy";
      else if (lower.includes("netlify")) queryTerm = "Netlify";

      if (lower.includes("lopez") || lower.includes("20041")) {
        targetAcc = "lopezserranojosemanuel20041@gmail.com";
      } else if (lower.includes("yesas")) {
        targetAcc = "yesas12345678@gmail.com";
      }

      const emailsRes = await executeFetchEmails(5, queryTerm, targetAcc);
      if (emailsRes?.data?.messages && emailsRes.data.messages.length > 0) {
        const list = emailsRes.data.messages
          .map((m) => {
            const previewSnippet = m.preview?.body?.slice(0, 160) || (m.messageText ? m.messageText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 160) : "");
            return `- De: ${m.sender || "Desconocido"} | Asunto: "${m.subject || "Sin asunto"}"\n  Detalle: ${previewSnippet}`;
          })
          .join("\n\n");
        toolContext = `CORREOS REALES OBTENIDOS DE GMAIL (${targetAcc}${queryTerm ? ` con filtro "${queryTerm}"` : ""}):\n${list}`;
      } else {
        toolContext = `GMAIL (${targetAcc}): No se encontraron correos con la búsqueda "${queryTerm || "recientes"}".`;
      }
    } catch (err) {
      toolContext = `ERROR CONSULTANDO GMAIL: ${err.message}`;
    }
  }

  // Consulta puntual sobre el estado, ramas, tareas o aplicaciones abiertas en el PC local
  if (
    lower.includes("antigravity") ||
    lower.includes("rama") || lower.includes("ramas") || lower.includes("repositorio") || lower.includes("repositorios") ||
    (lower.includes("en qué") && (lower.includes("trabaja") || lower.includes("trabajando") || lower.includes("hace") || lower.includes("haciendo"))) ||
    lower.includes("abierto") || lower.includes("abierta") || lower.includes("ventanas") || lower.includes("programas") || lower.includes("aplicaciones") ||
    lower.includes("qué tengo") || lower.includes("que tengo")
  ) {
    try {
      const pc = await getPcStatus();
      if (pc.online) {
        let pcReport = "INFORMACIÓN REAL EN VIVO DEL PC (WIN-CM7ASU1D27L):\n";
        if (pc.antigravity) {
          pcReport += `• Misión actual de Antigravity: "${pc.antigravity.lastGoal}" (hace ${pc.antigravity.minutesAgo} min)\n• Última acción: ${pc.antigravity.lastAction}\n`;
        } else {
          pcReport += "• Antigravity: En reposo o sin sesión activa detectada.\n";
        }
        if (pc.activeApps && pc.activeApps.length > 0) {
          pcReport += `\nAPLICACIONES Y PROGRAMAS ABIERTOS EN PANTALLA:\n${pc.activeApps.map(a => `• ${a}`).join("\n")}\n`;
        }
        if (pc.gitActivity && pc.gitActivity.length > 0) {
          pcReport += "\nESTADO REAL DE RAMAS Y REPOSITORIOS EN C:\\PROYECTOS:\n";
          for (const g of pc.gitActivity.slice(0, 8)) {
            const st = g.clean ? "Limpio" : `${g.dirtyCount} archivos modificados`;
            pcReport += `• [${g.name}] Rama: "${g.branch}" (${st}) | Último commit: ${g.commit} - "${g.commitMsg}" (${g.commitTime})\n`;
          }
        }
        toolContext = (toolContext ? `${toolContext}\n\n` : "") + pcReport;
      }
    } catch (agErr) {
      console.warn("[PC TELEMETRY PRE-FETCH WARN]:", agErr.message);
    }
  }

  if (
    (lower.includes("calendario") || lower.includes("agenda") || lower.includes("citas") || lower.includes("eventos") || lower.includes("cita") || lower.includes("entrecejo") || lower.includes("examen")) &&
    (lower.includes("mira") || lower.includes("revisa") || lower.includes("qué") || lower.includes("que") || lower.includes("tengo") || lower.includes("mis") || lower.includes("dónde") || lower.includes("donde") || lower.includes("cuándo") || lower.includes("cuando") || lower.includes("hay"))
  ) {
    try {
      callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
      const eventsRes = await executeFindCalendarEvents({
        timeMin: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        timeMax: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
        maxResults: 25,
      });
      const items = eventsRes?.data?.event_data?.event_data || eventsRes?.data?.items || [];
      const validItems = items.filter(it => it.summary && it.summary !== "undefined" && it.summary !== "no title" && it.summary !== "(sin título)");
      if (validItems.length > 0) {
        const list = validItems.map(it => {
          const s = it.start?.dateTime || it.start?.date;
          return `- "${it.summary}" (${s})`;
        }).join("\n");
        toolContext = `EVENTOS Y CITAS REALES ACTUALES EN GOOGLE CALENDAR:\n${list}`;
      } else {
        toolContext = "GOOGLE CALENDAR: No hay eventos ni citas agendadas en los próximos 14 días.";
      }
    } catch (err) {
      toolContext = `ERROR CONSULTANDO EVENTOS DE GOOGLE CALENDAR: ${err.message}`;
    }
  }

  // PROCESAMIENTO GENERAL CON IA (Texto + Imágenes + Audios/Notas de voz)
  try {
    let aiReply = await askJudeBrain(userText, chatId, toolContext, mediaPart);

    // Detectar notas automáticas
    const noteMatch = aiReply.match(/\[NOTA:\s*(.*?)\]/i);
    if (noteMatch) {
      addNote(noteMatch[1].trim());
      aiReply = aiReply.replace(noteMatch[0], "").trim();
    }

    // Detectar memorias automáticas
    const memoryMatch = aiReply.match(/\[MEMORIA:\s*(.*?)\]/i);
    if (memoryMatch) {
      saveMemory(memoryMatch[1].trim());
      aiReply = aiReply.replace(memoryMatch[0], "").trim();
    }

    // Detectar y ejecutar acción de envío de email
    const emailMatch = aiReply.match(/\[ACCION_EMAIL:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\]/i);
    if (emailMatch) {
      const recipient = emailMatch[1].trim();
      const subject = emailMatch[2].trim();
      const body = emailMatch[3].trim();
      aiReply = aiReply.replace(emailMatch[0], "").trim();

      try {
        callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
        await executeSendEmail(recipient, subject, body);
        aiReply += `\n\n📧 *Correo enviado exitosamente*\n• *Para:* \`${recipient}\`\n• *Asunto:* ${subject}\n• *Mensaje:* "${body}"`;
      } catch (sendErr) {
        console.error("[EMAIL SEND ERROR]", sendErr);
        aiReply += `\n\n⚠️ _Error al enviar correo a ${recipient}:_ ${sendErr.message}`;
      }
    }

    // Detectar acción de resumen de Gmail y limpieza de spam
    const resumenGmailMatch = aiReply.match(/\[(?:ACCION_RESUMEN_GMAIL|ACCION_LIMPIAR_SPAM)(?::\s*(.*?))?\]/i);
    if (resumenGmailMatch) {
      aiReply = aiReply.replace(resumenGmailMatch[0], "").trim();
      callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
      const summaryText = await cleanSpamAndSummarizeGmail({ targetChatId: chatId, isScheduled: false });
      if (summaryText) {
        aiReply += `\n\n${summaryText}`;
      }
    }

    // Detectar acción de lectura y consulta de emails
    const readEmailMatch = aiReply.match(/\[ACCION_LEER_EMAILS:\s*(.*?)\]/i);
    if (readEmailMatch) {
      const rawParams = readEmailMatch[1].trim();
      aiReply = aiReply.replace(readEmailMatch[0], "").trim();

      let targetMax = 5;
      let targetQuery = "";
      let targetAccount = DEFAULT_PRIMARY_GMAIL;

      const maxM = rawParams.match(/max\s*[:=]?\s*(\d+)/i);
      if (maxM) targetMax = parseInt(maxM[1], 10);

      const qM = rawParams.match(/query\s*[:=]?\s*["']?([^"'|]+)["']?/i);
      if (qM) targetQuery = qM[1].trim();
      else if (!rawParams.toLowerCase().includes("max") && !rawParams.toLowerCase().includes("account")) {
        targetQuery = rawParams;
      }

      const accM = rawParams.match(/account\s*[:=]?\s*["']?([^"'|]+)["']?/i);
      if (accM) targetAccount = accM[1].trim();

      try {
        callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
        const emailsRes = await executeFetchEmails(targetMax, targetQuery, targetAccount);
        const messages = emailsRes?.data?.messages || [];
        if (messages.length > 0) {
          const list = messages.map(m => {
            const previewSnippet = m.preview?.body?.slice(0, 160) || (m.messageText ? m.messageText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 160) : "");
            return `• *De:* ${m.sender || "Desconocido"}\n  *Asunto:* *${m.subject || "Sin asunto"}*\n  *Detalle:* _${previewSnippet}_`;
          }).join("\n\n");
          aiReply += `\n\n📬 *Correos recuperados en vivo (\`${targetAccount}\`)*:\n\n${list}`;
        } else {
          aiReply += `\n\n📬 *Bandeja de Gmail (\`${targetAccount}\`)*: No se encontraron correos con el filtro \`${targetQuery || "recientes"}\`.`;
        }
      } catch (readErr) {
        console.error("[EMAIL FETCH ERROR]", readErr);
        aiReply += `\n\n⚠️ _Error al consultar correos en ${targetAccount}:_ ${readErr.message}`;
      }
    }

    // Detectar acción de abrir app en la pantalla del PC
    const openAppMatch = aiReply.match(/\[ACCION_ABRIR_APP:\s*(.*?)\]/i);
    if (openAppMatch) {
      const appTarget = openAppMatch[1].trim();
      aiReply = aiReply.replace(openAppMatch[0], "").trim();
      const pc = await getPcStatus();
      if (pc.online) {
        await sendPcCommand("open_app", 0, null, { app: appTarget });
        aiReply += `\n\n🖥️ _Abriendo aplicación en tu pantalla:_ \`${appTarget}\``;
      } else {
        aiReply += `\n\n⚠️ _Tu ordenador en casa está apagado/hibernando para abrir esta aplicación._`;
      }
    }

    // Detectar acción de comando en consola de PC
    const pcCmdMatch = aiReply.match(/\[ACCION_PC_CMD:\s*(.*?)\]/i);
    if (pcCmdMatch) {
      const cmdToRun = pcCmdMatch[1].trim();
      aiReply = aiReply.replace(pcCmdMatch[0], "").trim();
      const pc = await getPcStatus();
      if (pc.online) {
        await sendPcTerminalCmd(cmdToRun);
        aiReply += `\n\n💻 _Comando ejecutado en tu PC:_ \`${cmdToRun}\``;
      } else {
        aiReply += `\n\n⚠️ _Tu ordenador en casa está apagado/hibernando para ejecutar este comando._`;
      }
    }

    // Detectar acción de lectura de archivo en PC
    const readMatch = aiReply.match(/\[ACCION_LEER_ARCHIVO:\s*(.*?)\]/i);
    if (readMatch) {
      const pathTarget = readMatch[1].trim();
      aiReply = aiReply.replace(readMatch[0], "").trim();
      const pc = await getPcStatus();
      if (pc.online) {
        await sendPcReadFile(pathTarget);
        aiReply += `\n\n📄 _Consultando archivo en tu PC:_ \`${pathTarget}\`...`;
      } else {
        aiReply += `\n\n⚠️ _Tu ordenador en casa está apagado. Enciéndelo para leer este archivo._`;
      }
    }

    // Detectar acción de edición o creación de archivo en PC
    const editMatch = aiReply.match(/\[ACCION_EDITAR_ARCHIVO:\s*(.*?)\s*\|\s*(.*?)\]/is);
    if (editMatch) {
      const pathTarget = editMatch[1].trim();
      const fileContent = editMatch[2].trim();
      aiReply = aiReply.replace(editMatch[0], "").trim();
      const pc = await getPcStatus();
      if (pc.online) {
        await sendPcWriteFile(pathTarget, fileContent);
        aiReply += `\n\n✏️ _Guardando archivo en tu PC:_ \`${pathTarget}\`...`;
      } else {
        aiReply += `\n\n⚠️ _Tu ordenador en casa está apagado para guardar este archivo._`;
      }
    }

    // Detectar delegación de programación a Antigravity en PC
    const codeTaskMatch = aiReply.match(/\[ACCION_PC_CODE:\s*(.*?)\]/i);
    if (codeTaskMatch) {
      const promptTask = codeTaskMatch[1].trim();
      aiReply = aiReply.replace(codeTaskMatch[0], "").trim();
      const pc = await getPcStatus();
      if (pc.online) {
        await sendPcCodeTask(promptTask);
        aiReply += `\n\n🚀 *Misión delegada a Antigravity en tu PC:* _${promptTask}_`;
      } else {
        aiReply += `\n\n⚠️ _Tu ordenador en casa está apagado para programar en local._`;
      }
    }

    // Detectar registro autónomo en Obsidian (Segundo Cerebro)
    const obsidianMatch = aiReply.match(/\[ACCION_OBSIDIAN:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\]/is);
    if (obsidianMatch) {
      const folder = obsidianMatch[1].trim();
      const filename = obsidianMatch[2].trim();
      const content = obsidianMatch[3].trim();
      aiReply = aiReply.replace(obsidianMatch[0], "").trim();
      const pc = await getPcStatus();
      if (pc.online) {
        await sendPcObsidianNote(folder, filename, content);
        aiReply += `\n\n🧠 _Registrado en Segundo Cerebro (Obsidian):_ \`${folder}/${filename}\``;
      }
    }

    // Detectar acción de agendar horas de estudio para examen en Google Calendar
    const studyMatch = aiReply.match(/\[ACCION_AGENDAR_ESTUDIO:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\]/i);
    if (studyMatch) {
      const matRaw = studyMatch[1].trim();
      const fechaRaw = studyMatch[2].trim();
      const horasRaw = studyMatch[3].trim();
      aiReply = aiReply.replace(studyMatch[0], "").trim();

      try {
        callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
        const studyResult = await scheduleExamStudySlots({
          materia: matRaw,
          fechaExamenStr: fechaRaw,
          horasRequeridas: horasRaw,
          chatId,
        });
        aiReply += `\n\n` + formatStudyScheduleReport(studyResult);
      } catch (studyErr) {
        console.error("[CALENDAR_STUDY_ERROR]", studyErr);
        aiReply += `\n\n⚠️ _Error al agendar en Google Calendar:_ ${studyErr.message}`;
      }
    }

    // Detectar acción de crear evento o cita en Google Calendar
    const createCalMatch = aiReply.match(/\[(?:ACCION_CALENDARIO_CREAR|ACCION_CREAR_EVENTO|ACCION_CALENDAR:\s*create_event):\s*(.*?)\]/i) ||
      aiReply.match(/ACCION_CALENDAR:\s*create_event\s*(.*?)(?:\n|$)/i);
    if (createCalMatch) {
      const rawParams = createCalMatch[1].trim();
      aiReply = aiReply.replace(createCalMatch[0], "").trim();
      const parts = rawParams.split("|").map(p => p.trim());
      const summary = parts[0] || "Cita";
      const startStr = parts[1] || "";
      const endStr = parts[2] || "";
      const calId = parts[3] || "primary";

      try {
        callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
        const isExamSummary = summary.toLowerCase().startsWith("examen") || summary.toLowerCase().startsWith("ex.");
        const examCalId = "d2e409d4411fa610161db0ab00ca3318344250ac9c4c1c794159086694f15f5e@group.calendar.google.com";
        const targetCalId = isExamSummary ? examCalId : (calId || "primary");
        const { date: startDate, hasTime, isAllDay: parsedAllDay } = parseFlexibleDateTime(startStr, 18);
        const finalAllDay = isExamSummary ? true : parsedAllDay;
        let endDate;
        if (endStr && !finalAllDay) {
          if (endStr.includes("h") || endStr.includes("m") || endStr.includes("hora")) {
            const durMatch = endStr.match(/(\d+(?:\.\d+)?)\s*(?:h|hora)/i);
            const durHours = durMatch ? parseFloat(durMatch[1]) : 1;
            endDate = new Date(startDate.getTime() + durHours * 3600 * 1000);
          } else {
            const parsedEnd = parseFlexibleDateTime(endStr, startDate.getHours() + 1);
            endDate = parsedEnd.date;
          }
        } else if (!finalAllDay) {
          endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
        }

        await executeCreateCalendarEvent({
          summary,
          start: startDate,
          end: endDate,
          calendarId: targetCalId,
          isAllDay: finalAllDay,
        });

        const dateFormatted = startDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
        const timeFormatted = isAllDay ? "Todo el día" : `${startDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} - ${endDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;

        aiReply += `\n\n📅 *Cita registrada en Google Calendar*\n• *Evento:* *${summary}*\n• *Fecha:* ${dateFormatted}\n• *Horario:* \`${timeFormatted}\`\n• *Calendario:* \`${calId}\``;

        const pc = await getPcStatus();
        if (pc.online) {
          const noteContent = `# Cita: [[${summary}]]\n\n- **Fecha:** ${dateFormatted}\n- **Horario:** ${timeFormatted}\n- **Calendario:** ${calId}\n- **Estado:** Agendado\n\n---\n*Sincronizado automáticamente por [[Jude]]*`;
          await sendPcObsidianNote("Citas", `${summary.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, "_")}.md`, noteContent);
        }
      } catch (calErr) {
        console.error("[CALENDAR_CREATE_ERROR]", calErr);
        aiReply += `\n\n⚠️ _Error al guardar en Google Calendar:_ ${calErr.message}`;
      }
    }

    // Detectar consulta o listado de eventos en Google Calendar
    const listCalMatch = aiReply.match(/\[(?:ACCION_CALENDARIO_LISTAR|ACCION_CALENDARIO):\s*(.*?)\]/i) ||
      aiReply.match(/\[ACCION_CALENDARIO\]/i) ||
      aiReply.match(/\bACCION_CALENDARIO\b/i);
    if (listCalMatch) {
      aiReply = aiReply.replace(listCalMatch[0], "").trim();
      try {
        callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
        const eventsRes = await executeFindCalendarEvents({
          timeMin: new Date().toISOString(),
          timeMax: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          maxResults: 15,
        });
        const items = eventsRes?.data?.event_data?.event_data || eventsRes?.data?.items || [];
        const validItems = items.filter(it => it.summary && it.summary !== "undefined" && it.summary !== "no title" && it.summary !== "(sin título)");
        if (validItems.length > 0) {
          const list = validItems.map(it => {
            const startStr = it.start?.dateTime || it.start?.date;
            const d = new Date(startStr);
            const day = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
            const time = it.start?.dateTime ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "Todo el día";
            return `• *${day}* \`${time}\` — *${it.summary}*`;
          }).join("\n");
          aiReply += `\n\n📅 *Eventos en tu Google Calendar (Próximos 7 días):*\n${list}`;
        } else {
          aiReply += `\n\n📅 *Google Calendar:* No tienes citas ni eventos registrados en los próximos 7 días.`;
        }
      } catch (err) {
        console.warn("[CALENDAR_LIST_WARN]", err.message);
      }
    }

    // Detectar eliminación de evento de Google Calendar
    const deleteCalMatch = aiReply.match(/\[ACCION_CALENDARIO_BORRAR:\s*(.*?)(?:\s*\|\s*(.*?))?\]/i);
    if (deleteCalMatch) {
      const eventId = deleteCalMatch[1].trim();
      const calId = deleteCalMatch[2]?.trim() || "primary";
      aiReply = aiReply.replace(deleteCalMatch[0], "").trim();
      try {
        callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
        await executeDeleteCalendarEvent(eventId, calId);
        aiReply += `\n\n🗑️ *Evento eliminado de Google Calendar* (\`${eventId}\`)`;
      } catch (delErr) {
        aiReply += `\n\n⚠️ _Error al eliminar evento:_ ${delErr.message}`;
      }
    }

    // Actualizar historial asegurando alternancia
    const currentHistory = getHistory(chatId);
    currentHistory.push({ role: "user", content: userText });
    currentHistory.push({ role: "assistant", content: aiReply });
    saveHistory(chatId, currentHistory, userText, aiReply);

    // Enviar respuesta a Telegram
    await sendTextMessage(chatId, aiReply);
  } catch (aiErr) {
    console.error("[IA ERROR]", aiErr);
    const memories = getMemories();
    const lower = userText.toLowerCase();
    if (lower.includes("novia") || lower.includes("pareja")) {
      await sendTextMessage(chatId, `Tu novia es Aleida, Manuel. La tengo bien presente en mis recuerdos.`);
    } else {
      await sendTextMessage(chatId, `Disculpa la espera, Manuel. Hubo una breve saturación temporal en la red. Ya tengo tu orden en cola y sigo conectado.`);
    }
  }
}

startPolling();
