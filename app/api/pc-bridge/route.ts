import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PC_STATUS_FILE = path.join(DATA_DIR, "pc_status.json");

function readPcState() {
  try {
    if (fs.existsSync(PC_STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(PC_STATUS_FILE, "utf-8"));
    }
  } catch {}
  return {
    lastSeen: 0,
    hostname: "PC-Manuel",
    commands: [],
    history: [],
  };
}

function writePcState(state: any) {
  try {
    fs.writeFileSync(PC_STATUS_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("[PC_BRIDGE ERROR] Guardando estado:", err);
  }
}

// GET: Consulta el estado del PC (Online u Offline)
export async function GET() {
  const state = readPcState();
  const now = Date.now();
  // Si no ha enviado señal en los últimos 20 segundos, el PC está apagado
  const isOnline = now - (state.lastSeen || 0) < 20000;

  return NextResponse.json({
    online: isOnline,
    lastSeen: state.lastSeen ? new Date(state.lastSeen).toISOString() : null,
    hostname: state.hostname || "PC-Manuel",
    secondsAgo: state.lastSeen ? Math.round((now - state.lastSeen) / 1000) : null,
    pendingCommands: state.commands?.length || 0,
  });
}

// POST: Maneja tanto el Heartbeat del PC como órdenes enviadas desde Telegram
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const state = readPcState();
    const now = Date.now();

    // 1. Latido de vida (Heartbeat enviado desde el PC en Windows)
    if (body.type === "heartbeat") {
      state.lastSeen = now;
      if (body.hostname) state.hostname = body.hostname;

      // Extraer comandos pendientes para entregárselos al PC
      const commandsToSend = [...(state.commands || [])];
      state.commands = []; // limpiar cola tras entregar
      writePcState(state);

      return NextResponse.json({
        status: "ok",
        commands: commandsToSend,
      });
    }

    // 2. Encolar orden de apagado o control (enviada desde Telegram)
    if (body.type === "command") {
      if (!state.commands) state.commands = [];
      const newCmd = {
        id: Date.now().toString(),
        action: body.action, // "shutdown" | "cancel_shutdown" | "restart"
        delaySeconds: body.delaySeconds || 0,
        createdAt: new Date().toISOString(),
      };
      state.commands.push(newCmd);
      writePcState(state);

      const isOnline = now - (state.lastSeen || 0) < 20000;
      return NextResponse.json({
        status: "queued",
        command: newCmd,
        pcOnline: isOnline,
      });
    }

    return NextResponse.json({ error: "Tipo no reconocido" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
