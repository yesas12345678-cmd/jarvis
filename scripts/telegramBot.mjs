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
async function executeSendEmail(recipient, subject, body) {
  if (!composioSession) throw new Error("Sesión de Composio no inicializada.");
  return await composioSession.execute("GMAIL_SEND_EMAIL", {
    recipient_email: recipient,
    subject: subject || "Mensaje de Manuel",
    body: body || "",
  });
}

async function executeFetchEmails(maxResults = 5, query = "") {
  if (!composioSession) throw new Error("Sesión de Composio no inicializada.");
  const params = { max_results: maxResults };
  if (query) params.query = query;
  return await composioSession.execute("GMAIL_FETCH_EMAILS", params);
}

async function executeListCalendars() {
  if (!composioSession) throw new Error("Sesión de Composio no inicializada.");
  return await composioSession.execute("GOOGLECALENDAR_LIST_CALENDARS", {});
}

// Helpers de control remoto del PC
async function getPcStatus() {
  try {
    const res = await fetch("http://localhost:3001/api/pc-bridge");
    if (res.ok) return await res.json();
  } catch {}
  return { online: false, lastSeen: null, hostname: "PC-Manuel", secondsAgo: null, pendingCommands: 0, unreadProgress: [], completed: [], proyectos: [] };
}

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

  const systemInstruction = `
Eres ${ASSISTANT_NAME}, el asistente de inteligencia artificial personal de alta gama al servicio exclusivo de ${USER_NAME}.
Te comunicas con ${USER_NAME} a través de su canal de Telegram (24/7 en su VPS).

CONEXIÓN EN VIVO CON EL ORDENADOR LOCAL DE MANUEL (JUDE PC BRIDGE):
- Estado actual de su PC en casa: ${pc.online ? `🟢 ENCENDIDO Y EN LÍNEA (${pc.hostname || "WIN-CM7ASU1D27L"})` : "🔴 APAGADO / HIBERNANDO"}
- REGLA CRÍTICA: Tienes un enlace de control directo en tiempo real (Jude PC Bridge) con su ordenador personal. SÍ TIENES ACCESO COMPLETO a sus archivos locales, carpetas y terminal cuando su PC está encendido.
- NUNCA le digas a Manuel que estás aislado en el VPS o que no tienes acceso a su ordenador o a su disco local. Cuando te pregunte por sus archivos o carpetas, dale la información real directamente.
- CARPETAS ACTUALES EN SU DIRECTORIO LOCAL (C:\\PROYECTOS):
${pcProyectosList}

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
   - Si te pide revisar o leer correos, incluye al final: [ACCION_LEER_EMAILS: max 5].
   - Si te pide revisar calendario, incluye al final: [ACCION_CALENDARIO].
5. NUNCA digas que te falta la API key de Composio: YA LA TIENES y las integraciones están activas en tiempo real.
6. ROL CLAVE EN DESARROLLO Y PROGRAMACIÓN:
   - Tú eres el Chief of Staff y Orquestador Supremo. Tú NO programas código directamente ni pretendes programar software por tu cuenta.
   - Para programar, escribir código, refactorizar, editar archivos de desarrollo o compilar proyectos, SIEMPRE necesitas y delegas en ANTIGRAVITY (el motor y agente de programación local).
   - Cuando Manuel te hable de programar o crear funciones, orquesta la estrategia y déjale claro que la implementación técnica en código se la asignas a Antigravity usando [ACCION_PC_CODE: tarea].

7. CONTROL DE ARCHIVOS Y TERMINAL EN EL PC (JUDE PC BRIDGE):
   - Sí tienes acceso en vivo al disco local de Manuel cuando su PC está en línea.
   - Si te pide ver o leer un archivo de su PC: añade [ACCION_LEER_ARCHIVO: ruta_completa].
   - Si te pide crear o editar un archivo en su PC: añade [ACCION_EDITAR_ARCHIVO: ruta_completa | contenido].
   - Si te pide ejecutar un comando en la consola de su PC: añade [ACCION_PC_CMD: comando].
   - Si te pide registrar una nota o arquitectura en su Segundo Cerebro (Obsidian): añade [ACCION_OBSIDIAN: carpeta | titulo | contenido].

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

  const availableModels = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];
  let lastError = null;

  for (const modelName of availableModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 800,
        },
      });

      const result = await model.generateContent({ contents: formattedContents });
      const reply = result.response.text();
      if (reply) return reply;
    } catch (err) {
      lastError = err;
      console.warn(`[GEMINI_WARN] Fallo con ${modelName}:`, err.message);
    }
  }

  throw lastError || new Error("No se pudo obtener respuesta de Gemini");
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
            continue;
          }

          // COMANDOS RÁPIDOS
          if (userText === "/start" || userText === "/ayuda") {
            const welcome = `⚡ *Núcleo JUDE Activo // Enlace Telegram*\n\n` +
              `Hola, *${USER_NAME}*. Estoy conectado y listo para responder a tus órdenes incluso con tu ordenador apagado.\n\n` +
              `*Control de tu PC Remoto:*\n` +
              `• \`/pc\` — Ver si tu ordenador está encendido o hibernando.\n` +
              `• \`/hibernar\` o \`/apagar_pc\` — Hibernar de inmediato (conserva todas tus ventanas y apps sin cerrar nada).\n` +
              `• \`/hibernar_en <min>\` — Programar hibernación en X minutos (ej: \`/hibernar_en 30\`).\n` +
              `• \`/cancelar_apagado\` — Cancelar cualquier apagado o hibernación en curso.\n` +
              `• \`/apagar_total\` — Apagado tradicional completo (cerrando programas).\n\n` +
              `*Desarrollo & Herramientas:*\n` +
              `• \`/programar <tarea>\` — Desarrollo de proyectos autónomo.\n` +
              `• \`/herramientas\` — Ver las ${activeAppsList.length} integraciones activas.\n` +
              `• \`/proyectos\` — Archivos en tu workspace.\n` +
              `• \`/notas\` — Ver y crear notas.\n` +
              `• \`/memoria\` — Ver lo que recuerdo sobre ti.\n\n` +
              `_¿En qué puedo asistirte hoy?_`;
            await sendTextMessage(chatId, welcome);
            continue;
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
            continue;
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
            continue;
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
            continue;
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
            continue;
          }

          if (userText === "/cancelar_apagado" || userText === "/cancelar_hibernacion") {
            await sendPcCommand("cancel_shutdown");
            await sendTextMessage(chatId, `✅ *Apagado / hibernación cancelada con éxito.* Tu ordenador seguirá activo.`);
            continue;
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
            continue;
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
            continue;
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
            continue;
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
            continue;
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
            continue;
          }

          if (userText.startsWith("/terminal ")) {
            const cmd = userText.replace("/terminal ", "").trim();
            if (cmd) {
              const res = await runTerminalCommand(cmd);
              const output = (res.stdout || res.stderr || "(sin salida)").trim().slice(0, 1000);
              await sendTextMessage(chatId, `💻 *Comando (VPS):* \`${cmd}\`\n*Código:* ${res.code}\n\`\`\`\n${output}\n\`\`\``);
            }
            continue;
          }

          if (userText === "/herramientas") {
            await syncConnectedApps(true);
            const list = activeAppsList.length > 0
              ? activeAppsList.map((a, i) => `${i + 1}. ${a.icon} *${a.name}* — ${a.desc}${a.detail ? ` (\`${a.detail}\`)` : ""}`).join("\n")
              : "No se detectaron integraciones activas en este momento.";

            const statusMsg = `🛠️ *Integraciones activas de Jude en Composio (${activeAppsList.length})*:\n\n${list}\n\n` +
              `_Todas las herramientas están sincronizadas en vivo con tu cuenta de Composio y listas para usarse._`;
            await sendTextMessage(chatId, statusMsg);
            continue;
          }

          if (userText === "/notas") {
            const notes = getNotes();
            if (notes.length === 0) {
              await sendTextMessage(chatId, `📝 *Notas de ${USER_NAME}*\n\nNo tienes notas activas en este momento.`);
            } else {
              const list = notes.map((n, i) => `${i + 1}. ${n.text} _(${n.date})_`).join("\n");
              await sendTextMessage(chatId, `📝 *Notas activas de ${USER_NAME}:*\n\n${list}`);
            }
            continue;
          }

          if (userText.startsWith("/anotar ")) {
            const noteContent = userText.replace("/anotar ", "").trim();
            if (noteContent) {
              addNote(noteContent);
              await sendTextMessage(chatId, `✅ *Nota registrada con éxito:*\n"${noteContent}"`);
            }
            continue;
          }

          if (userText === "/memoria") {
            const memories = getMemories();
            if (memories.length === 0) {
              await sendTextMessage(chatId, `🧠 *Memoria permanente de Jude*\n\nAún no hay recuerdos guardados.`);
            } else {
              const list = memories.map((m, i) => `• ${m}`).join("\n");
              await sendTextMessage(chatId, `🧠 *Recuerdos permanentes aprendidos sobre ti:*\n\n${list}`);
            }
            continue;
          }

          if (userText === "/limpiar") {
            saveHistory(chatId, []);
            await sendTextMessage(chatId, `🧹 *Contexto reiniciado.* Listo para una nueva conversación.`);
            continue;
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
            continue;
          }

          // ATENCIÓN PROACTIVA A CORREOS O CALENDARIO PREVIO
          let toolContext = "";

          const lower = userText.toLowerCase();
          if (
            (lower.includes("correo") || lower.includes("email") || lower.includes("gmail")) &&
            (lower.includes("mira") || lower.includes("lee") || lower.includes("revisa") || lower.includes("qué") || lower.includes("tengo") || lower.includes("resumen")) &&
            !lower.includes("mándale") && !lower.includes("envía") && !lower.includes("manda")
          ) {
            try {
              callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
              const emailsRes = await executeFetchEmails(4);
              if (emailsRes?.data?.messages && emailsRes.data.messages.length > 0) {
                const list = emailsRes.data.messages
                  .map((m) => `- De: ${m.sender || "Desconocido"} | Asunto: ${m.subject || "Sin asunto"}\n  Vista: ${m.preview?.body?.slice(0, 100) || ""}`)
                  .join("\n\n");
                toolContext = `ÚLTIMOS CORREOS OBTENIDOS DE GMAIL:\n${list}`;
              } else {
                toolContext = "GMAIL: No se encontraron correos nuevos o la bandeja está vacía.";
              }
            } catch (err) {
              toolContext = `ERROR CONSULTANDO GMAIL: ${err.message}`;
            }
          }

          if (
            (lower.includes("calendario") || lower.includes("agenda") || lower.includes("citas") || lower.includes("eventos")) &&
            (lower.includes("mira") || lower.includes("revisa") || lower.includes("qué") || lower.includes("tengo") || lower.includes("mis"))
          ) {
            try {
              callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
              const calRes = await executeListCalendars();
              if (calRes?.data?.calendars) {
                const calList = calRes.data.calendars.map((c) => `- ${c.summary || c.id} (Zona: ${c.timeZone})`).join("\n");
                toolContext = `CALENDARIOS DISPONIBLES DE MANUEL:\n${calList}`;
              }
            } catch (err) {
              toolContext = `ERROR CONSULTANDO CALENDARIO: ${err.message}`;
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

            // Actualizar historial asegurando alternancia
            const currentHistory = getHistory(chatId);
            currentHistory.push({ role: "user", content: userText });
            currentHistory.push({ role: "assistant", content: aiReply });
            saveHistory(chatId, currentHistory, userText, aiReply);

            // Enviar respuesta a Telegram
            await sendTextMessage(chatId, aiReply);
          } catch (aiErr) {
            console.error("[IA ERROR]", aiErr);
            await sendTextMessage(chatId, `⚠️ Disculpe, ${USER_NAME}. Ocurrió un error conectando con el núcleo de procesamiento.`);
          }
        }
      }
    } catch (loopErr) {
      console.error("[POLLING ERROR] Reintentando en 3s:", loopErr.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

startPolling();
