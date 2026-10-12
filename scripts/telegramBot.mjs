import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USER_ID = process.env.TELEGRAM_ALLOWED_USER_ID; // Opcional pero muy recomendado
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const USER_NAME = "Vaita";
const ASSISTANT_NAME = "Jude";

if (!BOT_TOKEN) {
  console.log("=================================================");
  console.log("ℹ️  TELEGRAM_BOT_TOKEN no está definido en .env.");
  console.log("   El bot de Telegram permanecerá en espera.");
  console.log("=================================================");
  process.exit(0);
}

if (!GEMINI_API_KEY) {
  console.error("❌ ERROR: GEMINI_API_KEY no encontrada en .env");
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DATA_DIR = path.join(process.cwd(), "data");
const MEMORIES_FILE = path.join(DATA_DIR, "memories.json");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");
const CHAT_HISTORY_FILE = path.join(DATA_DIR, "chat_history.json");

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
    if (!current.includes(text.trim())) {
      const updated = [...current, text.trim()];
      fs.writeFileSync(MEMORIES_FILE, JSON.stringify(updated, null, 2), "utf-8");
    }
  } catch (err) {
    console.error("[STORAGE] Error guardando memoria:", err);
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
    return updated;
  } catch (err) {
    console.error("[STORAGE] Error añadiendo nota:", err);
    return [];
  }
}

function clearNotes() {
  try {
    fs.writeFileSync(NOTES_FILE, JSON.stringify([], null, 2), "utf-8");
  } catch {}
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

function saveHistory(chatId, history) {
  try {
    let data = {};
    if (fs.existsSync(CHAT_HISTORY_FILE)) {
      data = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, "utf-8"));
    }
    data[String(chatId)] = history.slice(-20);
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[STORAGE] Error guardando historial:", err);
  }
}

// Inferencia de IA con Gemini para Telegram
async function askJudeBrain(userMessage, chatId) {
  const memories = getMemories();
  const history = getHistory(chatId);

  const systemInstruction = `
Eres ${ASSISTANT_NAME}, el asistente de inteligencia artificial personal de ${USER_NAME}.
Te estás comunicando con ${USER_NAME} a través de su chat privado de Telegram mientras el ordenador está apagado o en remoto.
Personalidad: Impecable, sofisticada, concisa, profesional y leal. Trata a ${USER_NAME} siempre con respeto y por su nombre.
Reglas:
1. Responde de forma directa y clara en texto.
2. Sé conciso pero completo (evita párrafos excesivamente largos a menos que se te pida un informe detallado).
3. Si ${USER_NAME} te pide anotar algo, añade al inicio o final un marcador especial: [NOTA: texto de la nota].
4. Si ${USER_NAME} te revela un hecho personal o preferencia clave que deba recordarse para siempre, añade un marcador: [MEMORIA: dato a recordar].
5. Memorias permanentes que ya conoces de ${USER_NAME}:
${memories.length > 0 ? memories.map((m) => ` - ${m}`).join("\n") : " - Ninguna registrada aún."}
`;

  // Construir historial en formato Gemini
  const contents = [];
  for (const h of history) {
    contents.push({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    });
  }
  contents.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 600,
      },
    }),
  });

  if (!response.ok) {
    // Fallback a gemini-1.5-flash si gemini-2.5 no responde
    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const fbRes = await fetch(fallbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
      }),
    });
    if (!fbRes.ok) {
      throw new Error(`Error en API de Gemini: ${fbRes.statusText}`);
    }
    const fbData = await fbRes.json();
    return fbData.candidates?.[0]?.content?.parts?.[0]?.text || "Disculpe, Vaita. No pude procesar la respuesta.";
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "Disculpe, Vaita. No pude procesar la respuesta.";
}

// Envío de mensaje a Telegram con reintentos
async function sendTextMessage(chatId, text) {
  return await callTelegram("sendMessage", {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown",
  });
}

// Bucle principal de Long Polling
async function startPolling() {
  console.log("=================================================");
  console.log(`🤖 [JUDE TELEGRAM BOT] Núcleo activo y escuchando.`);
  console.log(`   Asistente: ${ASSISTANT_NAME} // Usuario: ${USER_NAME}`);
  if (ALLOWED_USER_ID) {
    console.log(`   Seguridad: Restringido al ID de Telegram: ${ALLOWED_USER_ID}`);
  } else {
    console.log(`   ⚠️  Seguridad: Abierto (configura TELEGRAM_ALLOWED_USER_ID en .env)`);
  }
  console.log("=================================================");

  let offset = 0;

  while (true) {
    try {
      const updates = await callTelegram("getUpdates", {
        offset: offset,
        timeout: 30,
      });

      if (updates && updates.ok && updates.result) {
        for (const update of updates.result) {
          offset = update.update_id + 1;

          if (!update.message || !update.message.text) continue;

          const msg = update.message;
          const chatId = msg.chat.id;
          const senderId = String(msg.from.id);
          const userText = msg.text.trim();

          // Comprobación de seguridad
          if (ALLOWED_USER_ID && senderId !== String(ALLOWED_USER_ID)) {
            console.warn(`[SEGURIDAD] Mensaje no autorizado de ${senderId} (${msg.from.username || "sin username"}): ${userText}`);
            await sendTextMessage(
              chatId,
              `⛔ *Acceso Denegado*\n\nEste núcleo de inteligencia artificial pertenece exclusivamente a *${USER_NAME}*.`
            );
            continue;
          }

          console.log(`[TELEGRAM] Mensaje de ${USER_NAME}: "${userText}"`);

          // Indicador de "escribiendo..." en Telegram
          callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });

          // COMANDOS RÁPIDOS
          if (userText === "/start" || userText === "/ayuda") {
            const welcome = `⚡ *Núcleo JUDE Activo // Enlace Telegram*\n\n` +
              `Hola, *${USER_NAME}*. Estoy conectado a tu VPS y listo para responder a tus órdenes incluso con tu ordenador personal apagado.\n\n` +
              `*Comandos disponibles:*\n` +
              `• Escríbeme cualquier orden o duda normalmente.\n` +
              `• \`/notas\` — Ver tus notas y recordatorios activos.\n` +
              `• \`/anotar <texto>\` — Guardar una nueva nota.\n` +
              `• \`/memoria\` — Consultar lo que recuerdo sobre ti.\n` +
              `• \`/limpiar\` — Reiniciar el contexto de esta conversación.\n\n` +
              `_¿En qué puedo asistirte hoy?_`;
            await sendTextMessage(chatId, welcome);
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

          // PROCESAMIENTO GENERAL CON IA
          try {
            let aiReply = await askJudeBrain(userText, chatId);

            // Detectar notas y memorias automáticas en la respuesta
            const noteMatch = aiReply.match(/\[NOTA:\s*(.*?)\]/i);
            if (noteMatch) {
              addNote(noteMatch[1].trim());
              aiReply = aiReply.replace(noteMatch[0], "").trim();
            }

            const memoryMatch = aiReply.match(/\[MEMORIA:\s*(.*?)\]/i);
            if (memoryMatch) {
              saveMemory(memoryMatch[1].trim());
              aiReply = aiReply.replace(memoryMatch[0], "").trim();
            }

            // Actualizar historial
            const currentHistory = getHistory(chatId);
            currentHistory.push({ role: "user", content: userText });
            currentHistory.push({ role: "assistant", content: aiReply });
            saveHistory(chatId, currentHistory);

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
