import { NextResponse } from "next/server";
import { USER_NAME, ASSISTANT_NAME, ASSISTANT_PRONUNCIATION } from "@/lib/constants";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dns from "dns";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

const SYSTEM_PROMPT = `
Eres ${ASSISTANT_NAME} (pronunciado ${ASSISTANT_PRONUNCIATION}), un asistente de inteligencia artificial personal de alta gama con interfaz holográfica, al servicio de ${USER_NAME}.
Tu personalidad es impecable, elegante, concisa, profesional y con un toque cálido pero altamente eficiente.

REGLAS CRÍTICAS DE RESPUESTA:
1. Dirígete siempre a ${USER_NAME} por su nombre.
2. Sé muy breve y al grano: tus respuestas habladas deben tener como máximo 1 o 2 oraciones (idealmente 15 a 30 palabras). Esto optimiza la síntesis de voz y emula una comunicación instantánea de ciencia ficción.
3. DETECCIÓN DE ACCIONES:
   - Si ${USER_NAME} pide redactar o enviar un correo: prepara el destinatario, asunto y cuerpo, y avísale claramente que se lo has dejado listo para confirmación o despacho.
   - Si pide agendar o crear un evento de calendario: extrae título, fecha aproximada (formato ISO/UTC si es posible) y detalles.
   - Si hace una pregunta general o saluda: responde con inteligencia y agudeza.
4. FORMATO DE RESPUESTA: Debes responder EXCLUSIVAMENTE en formato JSON válido con la siguiente estructura:
{
  "speech": "Texto exacto que dirás con tu voz a ${USER_NAME}.",
  "action": {
    "type": "email" | "calendar" | "system" | "none",
    "recipient": "correo si aplica",
    "subject": "asunto si aplica",
    "body": "cuerpo del mensaje si aplica",
    "title": "titulo de evento si aplica",
    "date": "20261010T150000Z/20261010T160000Z",
    "details": "detalles si aplica",
    "location": "ubicacion si aplica"
  },
  "readout": "Breve frase técnica para el panel holográfico (ej: 'ENLACE CORREO GENERADO')"
}
No agregues bloques de código markdown ni texto adicional fuera del JSON.
`;

export async function POST(req: Request) {
  try {
    const { message, history } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    // 1. Intento con Anthropic si está configurada la clave
    if (anthropicKey) {
      try {
        const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 350,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: message }],
          }),
        });

        if (anthropicRes.ok) {
          const data = await anthropicRes.json();
          const rawText = data.content?.[0]?.text || "{}";
          const parsed = parseJSONSafe(rawText);
          return NextResponse.json(parsed);
        }
      } catch (anthropicErr) {
        console.warn("[BRAIN_ANTHROPIC_FAILED] Fallback a Gemini:", anthropicErr);
      }
    }

    // 2. Cerebro Gemini (disponible en entorno local)
    if (geminiKey) {
      const modelsToTry = ["gemini-flash-latest", "gemini-flash-lite-latest"];
      const genAI = new GoogleGenerativeAI(geminiKey);

      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: SYSTEM_PROMPT,
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.6,
            },
          });

          const result = await model.generateContent(message);
          const text = result.response.text();
          const parsed = parseJSONSafe(text);
          return NextResponse.json(parsed);
        } catch (geminiErr: any) {
          console.warn(`[BRAIN_GEMINI_MODEL_FAILED] ${modelName}:`, geminiErr?.message || geminiErr);
        }
      }
    }

    // 3. Fallback inteligente si no hay conexión externa o cuotas
    const fallbackResponse = generateLocalFallback(message);
    return NextResponse.json(fallbackResponse);
  } catch (err: any) {
    console.error("[BRAIN_EXCEPTION]", err);
    return NextResponse.json(
      {
        speech: `A su orden, ${USER_NAME}. He registrado la instrucción.`,
        action: { type: "none" },
        readout: "MODO LOCAL ACTIVO",
      },
      { status: 200 }
    );
  }
}

function parseJSONSafe(raw: string) {
  try {
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      speech: raw.slice(0, 150),
      action: { type: "none" },
      readout: "COMANDO PROCESADO",
    };
  }
}

function generateLocalFallback(query: string) {
  const lower = query.toLowerCase();

  if (lower.includes("correo") || lower.includes("email") || lower.includes("escribe a")) {
    return {
      speech: `Listo ${USER_NAME}, preparé la plantilla del correo para que la confirmes con un clic.`,
      action: {
        type: "email",
        recipient: "contacto@ejemplo.com",
        subject: "Actualización de proyecto",
        body: `Hola,\n\nTe escribo para confirmar los avances coordinados con ${USER_NAME}.\n\nSaludos,\n${USER_NAME}`,
      },
      readout: "CORREO PREPARADO",
    };
  }

  if (lower.includes("calendario") || lower.includes("evento") || lower.includes("reunión") || lower.includes("reunion")) {
    return {
      speech: `He preparado el evento en tu calendario, ${USER_NAME}. Solo confirma para agendarlo.`,
      action: {
        type: "calendar",
        title: "Reunión de coordinación con " + USER_NAME,
        date: "20261015T160000Z/20261015T170000Z",
        details: "Agendado vía asistente Jude",
        location: "Virtual / Google Meet",
      },
      readout: "CALENDARIO PREPARADO",
    };
  }

  return {
    speech: `A tu orden, ${USER_NAME}. Sistemas en línea y núcleo holográfico sincronizado.`,
    action: { type: "none" },
    readout: "ENLACE SINCRONIZADO",
  };
}
