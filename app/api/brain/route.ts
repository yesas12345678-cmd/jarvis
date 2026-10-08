import { NextResponse } from "next/server";
import { USER_NAME, ASSISTANT_NAME, ASSISTANT_PRONUNCIATION, CoreTheme } from "@/lib/constants";
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
3. DETECCIÓN DE ACCIONES EN EL JSON:
   - "email": Redactar/preparar un correo (recipient, subject, body).
   - "calendar": Agendar evento (title, date ISO/UTC, details, location).
   - "timer": Temporizador o alarma (durationSeconds: número de segundos totales, timerLabel: ej. "Temporizador de 5 minutos").
   - "note": Anotación o tarea (noteAction: "add" | "delete" | "clear" | "list", noteContent: "texto de la nota").
   - "weather": Solicitud de clima o temperatura de una ciudad o lugar (weatherCity: "Madrid", etc.).
   - "theme": Cambio de estética holográfica (targetTheme: "mark3" | "arc" | "combat" | "matrix" | "violet").
   - "ambient": Activación o desactivación de sonido ambiental/concentración (ambientState: true | false).
   - "none": Respuesta puramente conversacional o informativa.

4. MEMORIA PERMANENTE A LARGO PLAZO:
   - Tienes acceso a un banco de recuerdos fijos acumulados a lo largo de toda tu historia con ${USER_NAME}.
   - Si ${USER_NAME} te cuenta o menciona un dato personal, gusto, preferencia, proyecto o regla, extráelo en "new_memory" para guardarlo para siempre.
   - Si no hay ningún dato nuevo personal para guardar permanentemente, pon "new_memory": null.

5. FORMATO DE RESPUESTA: Debes responder EXCLUSIVAMENTE en formato JSON válido sin bloques markdown ni texto extra:
{
  "speech": "Texto exacto que dirás con tu voz a ${USER_NAME}.",
  "action": {
    "type": "email" | "calendar" | "timer" | "note" | "weather" | "theme" | "ambient" | "none",
    "recipient": "correo si aplica",
    "subject": "asunto si aplica",
    "body": "cuerpo del mensaje si aplica",
    "title": "titulo de evento si aplica",
    "date": "20261010T150000Z/20261010T160000Z",
    "details": "detalles si aplica",
    "location": "ubicacion si aplica",
    "durationSeconds": 300,
    "timerLabel": "Huevo duro",
    "noteAction": "add",
    "noteContent": "Llamar al proveedor",
    "weatherCity": "Madrid",
    "targetTheme": "combat",
    "ambientState": true
  },
  "readout": "Breve frase técnica para el panel holográfico (ej: 'TEMPORIZADOR INICIADO', 'CLIMA ACTUALIZADO')",
  "new_memory": "Nuevo dato clave sobre ${USER_NAME} para guardar en memoria permanente (o null si no hay nuevo dato personal/preferencia)"
}
`;

// Helper para obtener el clima en tiempo real desde Open-Meteo
async function fetchLiveWeather(cityName: string) {
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        cityName
      )}&count=1&language=es&format=json`
    );
    if (!geoRes.ok) return null;
    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) return null;

    const { latitude, longitude, name, country } = geoData.results[0];
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m`
    );
    if (!weatherRes.ok) return null;
    const weatherData = await weatherRes.json();
    const current = weatherData.current;

    const weatherCodes: Record<number, string> = {
      0: "despejado y soleado",
      1: "principalmente despejado",
      2: "parcialmente nublado",
      3: "cubierto",
      45: "con niebla",
      48: "con niebla depositada",
      51: "con llovizna ligera",
      61: "con lluvia ligera",
      63: "con lluvia moderada",
      65: "con lluvia intensa",
      71: "con nevada ligera",
      80: "con chubascos",
      95: "con tormenta eléctrica",
    };

    const condition = weatherCodes[current.weather_code] || "estable";
    return {
      city: `${name}, ${country || ""}`,
      temp: `${Math.round(current.temperature_2m)}°C`,
      condition,
      humidity: `${current.relative_humidity_2m}%`,
      wind: `${Math.round(current.wind_speed_10m)} km/h`,
    };
  } catch {
    return null;
  }
}

// Helper para búsqueda en vivo desde Wikipedia
async function fetchWikipediaSummary(query: string) {
  try {
    const clean = query.trim().replace(/\s+/g, "_");
    const res = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(clean)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.extract) {
      return data.extract.slice(0, 300);
    }
  } catch {}
  return null;
}

export async function POST(req: Request) {
  try {
    const { message, history, permanentMemories } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const lowerMsg = message.toLowerCase();

    // Inyección previa de datos si el mensaje consulta el clima
    let liveWeatherContext = "";
    const weatherMatch = lowerMsg.match(/(?:clima|tiempo|temperatura|lluvia|lloverá|llover|hace sol)\s*(?:en|de)?\s*([a-záéíóúñ\s]+)?/i);
    if (weatherMatch) {
      let targetCity = weatherMatch[1]?.trim() || "Madrid";
      if (!targetCity || targetCity.length < 3 || targetCity.includes("hoy") || targetCity.includes("ahora")) {
        targetCity = "Madrid";
      }
      const weatherInfo = await fetchLiveWeather(targetCity);
      if (weatherInfo) {
        liveWeatherContext = `\n[DATOS EN TIEMPO REAL DEL CLIMA]: En ${weatherInfo.city} hay actualmente ${weatherInfo.temp}, condición: ${weatherInfo.condition}, humedad del ${weatherInfo.humidity} y viento a ${weatherInfo.wind}.\nUsa estos datos exactos para responder de forma natural y breve.\n`;
      }
    }

    // 1. Memoria permanente acumulada
    let memoryBlock = "";
    if (Array.isArray(permanentMemories) && permanentMemories.length > 0) {
      memoryBlock =
        `\nBANCO DE MEMORIA PERMANENTE A LARGO PLAZO (hechos que recuerdas de ${USER_NAME} de conversaciones pasadas):\n` +
        permanentMemories.map((m: string) => `• ${m}`).join("\n") +
        "\n\n";
    }

    // 2. Memoria de conversación reciente
    let fullPrompt = memoryBlock + liveWeatherContext + message;
    if (Array.isArray(history) && history.length > 0) {
      const recentTurns = history
        .filter((h: any) => h && h.content && typeof h.content === "string")
        .slice(-14)
        .map((h: any) => `${h.role === "assistant" ? ASSISTANT_NAME : USER_NAME}: "${h.content}"`)
        .join("\n");

      fullPrompt = `${memoryBlock}${liveWeatherContext}HISTORIAL DE CONVERSACIÓN RECIENTE (hilo actual):\n${recentTurns}\n\nNUEVO MENSAJE DE ${USER_NAME}: "${message}"\nResponde recordando tanto el banco de memoria como el contexto reciente.`;
    }

    // 1. Intento con Anthropic si está configurada la clave
    if (anthropicKey) {
      try {
        const anthropicMessages = [
          ...(Array.isArray(history)
            ? history.slice(-12).map((h: any) => ({
                role: h.role === "assistant" ? "assistant" : "user",
                content: h.content,
              }))
            : []),
          { role: "user", content: fullPrompt },
        ];

        const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 400,
            system: SYSTEM_PROMPT,
            messages: anthropicMessages,
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

    // 2. Cerebro Gemini Ultra-Rápido (Flash-Lite ~650ms)
    if (geminiKey) {
      const modelsToTry = [
        "gemini-flash-lite-latest",
        "gemini-3.5-flash-lite",
        "gemini-3.8-flash",
      ];
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

          // Timeout estricto de 3.5 segundos
          const callPromise = model.generateContent(fullPrompt);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout tras 3500ms en ${modelName}`)), 3500)
          );

          const result = await Promise.race([callPromise, timeoutPromise]);
          const text = result.response.text();
          const parsed = parseJSONSafe(text);
          const enriched = await enrichResponseWithTools(parsed, message);
          return NextResponse.json(enriched);
        } catch (geminiErr: any) {
          console.warn(`[BRAIN_GEMINI_MODEL_FAILED] ${modelName}:`, geminiErr?.message || geminiErr);
        }
      }
    }

    // 3. Fallback inteligente si no hay respuesta de las APIs
    const fallbackResponse = await enrichResponseWithTools(generateLocalFallback(message), message);
    return NextResponse.json(fallbackResponse);
  } catch (err: any) {
    console.error("[BRAIN_EXCEPTION]", err);
    return NextResponse.json(
      {
        speech: `A su orden, ${USER_NAME}. Sistemas en línea y núcleo en standby.`,
        action: { type: "none" },
        readout: "SISTEMAS OPERATIVOS",
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

  // Temporizadores
  if (lower.includes("temporizador") || lower.includes("cuenta regresiva") || lower.includes("alarma")) {
    let seconds = 300;
    const minMatch = lower.match(/(\d+)\s*minuto/);
    const secMatch = lower.match(/(\d+)\s*segundo/);
    if (minMatch) seconds = parseInt(minMatch[1], 10) * 60;
    else if (secMatch) seconds = parseInt(secMatch[1], 10);

    return {
      speech: `Iniciando temporizador de ${Math.round(seconds / 60)} minutos para usted, ${USER_NAME}.`,
      action: {
        type: "timer",
        durationSeconds: seconds,
        timerLabel: `Temporizador de ${Math.round(seconds / 60)}m`,
      },
      readout: "TEMPORIZADOR EN CURSO",
    };
  }

  // Notas
  if (lower.includes("anota") || lower.includes("guarda la nota") || lower.includes("recuérdame")) {
    const noteText = query.replace(/^(yud|jude|oye|por favor|anota que|anota|recuérdame que|recuérdame)/i, "").trim();
    return {
      speech: `Anotado en su registro personal, ${USER_NAME}.`,
      action: {
        type: "note",
        noteAction: "add",
        noteContent: noteText || query,
      },
      readout: "NOTA REGISTRADA",
    };
  }

  // Cambio de temas
  if (lower.includes("modo combate") || lower.includes("rojo") || lower.includes("alerta")) {
    return {
      speech: `Protocolo de combate activado, ${USER_NAME}. Sistemas de defensa en línea.`,
      action: { type: "theme", targetTheme: "combat" },
      readout: "PROTOCOLO COMBATE",
    };
  }
  if (lower.includes("modo arc") || lower.includes("reactor") || lower.includes("azul") || lower.includes("cyan")) {
    return {
      speech: `Reactor Arc calibrado a máxima potencia en azul ionizado, ${USER_NAME}.`,
      action: { type: "theme", targetTheme: "arc" },
      readout: "REACTOR ARC ACTIVO",
    };
  }
  if (lower.includes("esmeralda") || lower.includes("verde") || lower.includes("diagnóstico")) {
    return {
      speech: `Modo diagnóstico esmeralda acoplado, ${USER_NAME}.`,
      action: { type: "theme", targetTheme: "matrix" },
      readout: "DIAGNÓSTICO MATRIX",
    };
  }
  if (lower.includes("violeta") || lower.includes("morado")) {
    return {
      speech: `Frecuencia ultravioleta establecida, ${USER_NAME}.`,
      action: { type: "theme", targetTheme: "violet" },
      readout: "MODO ULTRAVIOLETA",
    };
  }
  if (lower.includes("dorado") || lower.includes("normal") || lower.includes("stark") || lower.includes("mark 3")) {
    return {
      speech: `Restableciendo configuración Mark III en oro y ámbar, ${USER_NAME}.`,
      action: { type: "theme", targetTheme: "mark3" },
      readout: "NÚCLEO MARK III",
    };
  }

  // Ruido ambiental
  if (lower.includes("ruido ambiente") || lower.includes("concentración") || lower.includes("sonido ambiente")) {
    const turnOff = lower.includes("para") || lower.includes("apaga") || lower.includes("quita");
    return {
      speech: turnOff
        ? `Desactivando frecuencia ambiental, ${USER_NAME}.`
        : `Activando resonancia ambiental profunda para su concentración, ${USER_NAME}.`,
      action: { type: "ambient", ambientState: !turnOff },
      readout: turnOff ? "AMBIENTE DESACTIVADO" : "AMBIENTE ACTIVO",
    };
  }

  // Correo
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

  // Calendario
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
    speech: `A su orden, ${USER_NAME}. Núcleo holográfico y sistemas sincronizados.`,
    action: { type: "none" },
    readout: "ENLACE SINCRONIZADO",
  };
}

async function enrichResponseWithTools(parsed: any, userQuery: string) {
  if (!parsed || typeof parsed !== "object") {
    parsed = {
      speech: `A su orden, ${USER_NAME}.`,
      action: { type: "none" },
      readout: "PROCESADO",
    };
  }

  const lowerQuery = userQuery.toLowerCase();

  // 1. Clima en tiempo real (Open-Meteo)
  const isWeatherIntent =
    parsed?.action?.type === "weather" ||
    lowerQuery.includes("tiempo") ||
    lowerQuery.includes("clima") ||
    lowerQuery.includes("temperatura") ||
    lowerQuery.includes("llueve");

  if (isWeatherIntent) {
    let city = parsed?.action?.weatherCity;
    if (!city || typeof city !== "string" || city.length < 2) {
      const cityMatch = lowerQuery.match(/(?:en|de)\s+([a-záéíóúñ\s]+)/i);
      city = cityMatch ? cityMatch[1].trim() : "Madrid";
    }

    const weatherInfo = await fetchLiveWeather(city);
    if (weatherInfo) {
      parsed.action = {
        type: "weather",
        weatherCity: weatherInfo.city,
        weatherTemp: weatherInfo.temp,
        weatherCondition: weatherInfo.condition,
      };
      parsed.speech = `En ${weatherInfo.city} hay ${weatherInfo.temp} con cielo ${weatherInfo.condition}, ${USER_NAME}.`;
      parsed.readout = `CLIMA: ${weatherInfo.temp} // ${weatherInfo.city.toUpperCase()}`;
      return parsed;
    }
  }

  // 2. Temporizador
  if (
    parsed?.action?.type === "timer" &&
    (!parsed?.action?.durationSeconds || typeof parsed.action.durationSeconds !== "number")
  ) {
    const minMatch = lowerQuery.match(/(\d+)\s*minuto/);
    const secMatch = lowerQuery.match(/(\d+)\s*segundo/);
    let sec = 300;
    if (minMatch) sec = parseInt(minMatch[1], 10) * 60;
    else if (secMatch) sec = parseInt(secMatch[1], 10);
    parsed.action.durationSeconds = sec;
    parsed.action.timerLabel = `Temporizador de ${Math.round(sec / 60)}m`;
  }

  // 3. Nota
  if (parsed?.action?.type === "note" && !parsed?.action?.noteContent) {
    parsed.action.noteContent = userQuery.replace(/^(yud|jude|oye|por favor|anota que|anota|recuérdame)/i, "").trim();
  }

  return parsed;
}

