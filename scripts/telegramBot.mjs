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

// Inferencia con Gemini SDK
async function askJudeBrain(userMessage, chatId, toolContext = "") {
  await syncConnectedApps();

  const memories = getMemories();
  const history = getHistory(chatId);

  const activeAppsSummary = activeAppsList.length > 0
    ? activeAppsList.map((a, i) => `${i + 1}. ${a.icon} ${a.name} (${a.desc}${a.detail ? `: ${a.detail}` : ""})`).join("\n")
    : "• Conexiones en proceso de inicialización.";

  const systemInstruction = `
Eres ${ASSISTANT_NAME}, el asistente de inteligencia artificial personal de alta gama al servicio exclusivo de ${USER_NAME}.
Te comunicas con ${USER_NAME} a través de su canal de Telegram (24/7 en su VPS).

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

  if (lastRole === "user") {
    formattedContents[formattedContents.length - 1].parts[0].text += `\n${userMessage}`;
  } else {
    formattedContents.push({
      role: "user",
      parts: [{ text: userMessage }],
    });
  }

  const availableModels = ["gemini-3.5-flash-lite", "gemini-3.5-flash"];
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

  while (true) {
    try {
      const updates = await callTelegram("getUpdates", {
        offset: offset,
        timeout: 25,
      });

      if (updates && updates.ok && updates.result) {
        for (const update of updates.result) {
          offset = update.update_id + 1;

          if (!update.message || !update.message.text) continue;

          const msg = update.message;
          const chatId = msg.chat.id;
          const senderId = String(msg.from.id);
          const userText = msg.text.trim();

          console.log(`[TELEGRAM] Mensaje de ${msg.from.first_name || "Manuel"} (${senderId}): "${userText}"`);

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

          // COMANDOS RÁPIDOS
          if (userText === "/start" || userText === "/ayuda") {
            const welcome = `⚡ *Núcleo JUDE Activo // Enlace Telegram*\n\n` +
              `Hola, *${USER_NAME}*. Estoy conectado y listo para responder a tus órdenes incluso con tu ordenador apagado.\n\n` +
              `*Comandos disponibles:*\n` +
              `• Escríbeme cualquier orden o duda normalmente.\n` +
              `• \`/programar <tarea>\` (o \`/code\`) — Desarrollar proyectos, crear scripts y commitear a GitHub de forma autónoma.\n` +
              `• \`/proyectos\` — Ver archivos y proyectos en tu workspace del VPS.\n` +
              `• \`/terminal <comando>\` — Ejecutar un comando en la terminal Linux del servidor.\n` +
              `• \`/herramientas\` — Ver todas las integraciones activas (${activeAppsList.length}).\n` +
              `• \`/notas\` — Ver tus notas y recordatorios activos.\n` +
              `• \`/anotar <texto>\` — Guardar una nueva nota.\n` +
              `• \`/memoria\` — Consultar lo que recuerdo sobre ti.\n` +
              `• \`/limpiar\` — Reiniciar el contexto de esta conversación.\n\n` +
              `_¿En qué puedo asistirte hoy?_`;
            await sendTextMessage(chatId, welcome);
            continue;
          }

          if (userText.startsWith("/code ") || userText.startsWith("/programar ")) {
            const prompt = userText.replace(/^\/(code|programar)\s+/, "").trim();
            if (prompt) {
              await sendTextMessage(chatId, `🚀 *Modo Agente Programador Activado*\n\n🎯 *Objetivo:* _${prompt}_\n\nIniciando desarrollo autónomo en el servidor VPS...`);
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
            continue;
          }

          if (userText === "/proyectos" || userText === "/archivos") {
            const res = listProjectFiles();
            if (!res.success || res.files.length === 0) {
              await sendTextMessage(chatId, `📂 *Workspace de Proyectos*\n\nNo hay archivos en \`/app/workspace\` todavía. Puedes pedirme crear uno con \`/programar <tarea>\`.`);
            } else {
              const list = res.files.map((f) => `• ${f.type === "dir" ? "📁" : "📄"} \`${f.path}\` ${f.size ? `_(${f.size} B)_` : ""}`).slice(0, 35).join("\n");
              await sendTextMessage(chatId, `📂 *Archivos en tu Workspace (${res.files.length}):*\n\n${list}`);
            }
            continue;
          }

          if (userText.startsWith("/terminal ")) {
            const cmd = userText.replace("/terminal ", "").trim();
            if (cmd) {
              const res = await runTerminalCommand(cmd);
              const output = (res.stdout || res.stderr || "(sin salida)").trim().slice(0, 1000);
              await sendTextMessage(chatId, `💻 *Comando:* \`${cmd}\`\n*Código:* ${res.code}\n\`\`\`\n${output}\n\`\`\``);
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

          // PROCESAMIENTO GENERAL CON IA
          try {
            let aiReply = await askJudeBrain(userText, chatId, toolContext);

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
