import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
// INTEGRACIÓN CON COMPOSIO (@composio/core)
// ==========================================
let composio = null;
let composioSession = null;
let composioUserId = null;
let connectedAppsStatus = {
  gmail: { active: false, email: null },
  calendar: { active: false },
  github: { active: false },
};

async function initComposio() {
  if (!COMPOSIO_API_KEY) {
    console.log("ℹ️  [COMPOSIO] No se especificó COMPOSIO_API_KEY.");
    return;
  }

  try {
    const { Composio } = await import("@composio/core");
    composio = new Composio({ apiKey: COMPOSIO_API_KEY });

    // Descubrir cuentas conectadas
    const accounts = await composio.client.connectedAccounts.list();
    if (accounts && accounts.items) {
      for (const acc of accounts.items) {
        if (acc.status === "ACTIVE") {
          composioUserId = acc.user_id;
          const toolkit = acc.toolkit?.slug?.toLowerCase() || "";
          if (toolkit.includes("gmail")) {
            connectedAppsStatus.gmail.active = true;
          }
          if (toolkit.includes("calendar")) {
            connectedAppsStatus.calendar.active = true;
          }
          if (toolkit.includes("github")) {
            connectedAppsStatus.github.active = true;
          }
        }
      }
    }

    if (!composioUserId) {
      composioUserId = "7777389793";
    }

    composioSession = await composio.create(composioUserId);

    // Obtener detalles del perfil de Gmail si está activo
    if (connectedAppsStatus.gmail.active) {
      try {
        const profile = await composioSession.execute("GMAIL_GET_PROFILE", {});
        if (profile?.data?.emailAddress) {
          connectedAppsStatus.gmail.email = profile.data.emailAddress;
        }
      } catch {}
    }

    console.log("⚡ [COMPOSIO] Sesión iniciada con éxito.");
    console.log(`   Usuario: ${composioUserId}`);
    console.log(`   Gmail: ${connectedAppsStatus.gmail.active ? `ACTIVO (${connectedAppsStatus.gmail.email || "conectado"})` : "Inactivo"}`);
    console.log(`   Calendario: ${connectedAppsStatus.calendar.active ? "ACTIVO" : "Inactivo"}`);
    console.log(`   GitHub: ${connectedAppsStatus.github.active ? "ACTIVO" : "Inactivo"}`);
  } catch (err) {
    console.warn("⚠️  [COMPOSIO] Error inicializando SDK:", err.message);
  }
}

// Ejecución de herramientas Composio
async function executeSendEmail(recipient, subject, body) {
  if (!composioSession || !connectedAppsStatus.gmail.active) {
    throw new Error("Gmail no está conectado o autorizado en Composio.");
  }
  const res = await composioSession.execute("GMAIL_SEND_EMAIL", {
    recipient_email: recipient,
    subject: subject || "Mensaje de Manuel",
    body: body || "",
  });
  return res;
}

async function executeFetchEmails(maxResults = 5, query = "") {
  if (!composioSession || !connectedAppsStatus.gmail.active) {
    throw new Error("Gmail no está conectado o autorizado en Composio.");
  }
  const params = { max_results: maxResults };
  if (query) params.query = query;
  const res = await composioSession.execute("GMAIL_FETCH_EMAILS", params);
  return res;
}

async function executeListCalendars() {
  if (!composioSession || !connectedAppsStatus.calendar.active) {
    throw new Error("Google Calendar no está conectado en Composio.");
  }
  const res = await composioSession.execute("GOOGLECALENDAR_LIST_CALENDARS", {});
  return res;
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
  const memories = getMemories();
  const history = getHistory(chatId);

  const gmailInfo = connectedAppsStatus.gmail.active
    ? `CONECTADO Y OPERATIVO (Cuenta: ${connectedAppsStatus.gmail.email || "Autorizada"})`
    : "No conectado";

  const calendarInfo = connectedAppsStatus.calendar.active
    ? "CONECTADO Y OPERATIVO"
    : "No conectado";

  const githubInfo = connectedAppsStatus.github.active
    ? "CONECTADO Y OPERATIVO"
    : "No conectado";

  const systemInstruction = `
Eres ${ASSISTANT_NAME}, el asistente de inteligencia artificial personal de alta gama al servicio exclusivo de ${USER_NAME}.
Te comunicas con ${USER_NAME} a través de su canal de Telegram (24/7 en su VPS).

PERSONALIDAD & TRATO:
- Impecable, sofisticada, leal, eficiente y concisa.
- Dirígete a él como Manuel o Vaita.
- TIENES MEMORIA CONTINUA: Conoces perfectamente todo lo que te ha dicho previamente en este chat y tus respuestas anteriores.

ESTADO DE HERRAMIENTAS REALES CONECTADAS (COMPOSIO):
- Gmail: ${gmailInfo}
- Google Calendar: ${calendarInfo}
- GitHub: ${githubInfo}

REGLAS DE OPERACIÓN:
1. Recuerda todos los datos personales que te diga Manuel.
2. Si Manuel te revela un dato nuevo (ej: "tengo novia", "mi trabajo es..."), CONFÍRMASELO brevemente y añade al final de tu respuesta: [MEMORIA: dato exacto en 3-6 palabras].
3. Si te pide anotar algo, añade: [NOTA: texto de la nota].
4. ACCIONES REALES DE CORREO:
   - Si Manuel te ordena enviar un correo a alguien, extrae los parámetros e incluye al final: [ACCION_EMAIL: destinatario@correo.com | Asunto | Contenido].
   - Si te pide revisar o leer correos, incluye al final: [ACCION_LEER_EMAILS: max 5].
   - Si te pide revisar calendario, incluye al final: [ACCION_CALENDARIO].
5. NUNCA digas que no tienes la API key de Composio configurada: YA LA TIENES y las integraciones están activas.

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
              `• \`/herramientas\` — Estado de Gmail, Calendario y GitHub.\n` +
              `• \`/notas\` — Ver tus notas y recordatorios activos.\n` +
              `• \`/anotar <texto>\` — Guardar una nueva nota.\n` +
              `• \`/memoria\` — Consultar lo que recuerdo sobre ti.\n` +
              `• \`/limpiar\` — Reiniciar el contexto de esta conversación.\n\n` +
              `_¿En qué puedo asistirte hoy?_`;
            await sendTextMessage(chatId, welcome);
            continue;
          }

          if (userText === "/herramientas") {
            const statusMsg = `🛠️ *Estado de Herramientas de Jude (Composio)*:\n\n` +
              `• *Gmail*: ${connectedAppsStatus.gmail.active ? `✅ Conectado (${connectedAppsStatus.gmail.email || "Activo"})` : "❌ Inactivo"}\n` +
              `• *Google Calendar*: ${connectedAppsStatus.calendar.active ? "✅ Conectado" : "❌ Inactivo"}\n` +
              `• *GitHub*: ${connectedAppsStatus.github.active ? "✅ Conectado" : "❌ Inactivo"}\n\n` +
              `Puedes pedirme:\n` +
              `- _"Mándale un correo a X con el mensaje Y"_\n` +
              `- _"Mira mis correos recientes"_\n` +
              `- _"Consulta mis calendarios"_`;
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

          // ATENCIÓN PROACTIVA A CORREOS O CALENDARIO PREVIO
          let toolContext = "";

          // 1. Detectar si el usuario pide leer correos
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

          // 2. Detectar si el usuario pide ver el calendario
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
