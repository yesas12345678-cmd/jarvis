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
    progressUpdates: [],
    completedTasks: [],
  };
}

function writePcState(state: any) {
  try {
    fs.writeFileSync(PC_STATUS_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("[PC_BRIDGE ERROR] Guardando estado:", err);
  }
}

// GET: Consulta el estado del PC y tareas en curso
export async function GET() {
  const state = readPcState();
  const now = Date.now();
  const isOnline = now - (state.lastSeen || 0) < 20000;

  // Extraer mensajes de progreso no leídos
  const unreadProgress = [...(state.progressUpdates || [])];
  state.progressUpdates = []; // limpiar leídos

  // Extraer tareas completadas pendientes
  const completed = [...(state.completedTasks || [])];
  state.completedTasks = []; // limpiar entregadas
  writePcState(state);

  return NextResponse.json({
    online: isOnline,
    lastSeen: state.lastSeen ? new Date(state.lastSeen).toISOString() : null,
    hostname: state.hostname || "PC-Manuel",
    secondsAgo: state.lastSeen ? Math.round((now - state.lastSeen) / 1000) : null,
    pendingCommands: state.commands?.length || 0,
    unreadProgress,
    completed,
    proyectos: state.proyectos || [],
  });
}

// POST: Maneja Heartbeat, órdenes de Telegram y reportes de progreso del PC
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const state = readPcState();
    const now = Date.now();

    // 1. Latido de vida (Heartbeat enviado desde el PC en Windows)
    if (body.type === "heartbeat") {
      state.lastSeen = now;
      if (body.hostname) state.hostname = body.hostname;
      if (body.proyectos) state.proyectos = body.proyectos;

      // Extraer comandos pendientes para entregárselos al PC
      const commandsToSend = [...(state.commands || [])];
      state.commands = []; // limpiar cola tras entregar
      writePcState(state);

      return NextResponse.json({
        status: "ok",
        commands: commandsToSend,
      });
    }

    // 2. Reporte de progreso de desarrollo enviado desde el PC
    if (body.type === "progress") {
      if (!state.progressUpdates) state.progressUpdates = [];
      state.progressUpdates.push({
        taskId: body.taskId,
        message: body.message,
        timestamp: new Date().toISOString(),
      });
      writePcState(state);
      return NextResponse.json({ status: "ok" });
    }

    // 3. Tarea completada reportada por el PC
    if (body.type === "task_complete") {
      if (!state.completedTasks) state.completedTasks = [];
      state.completedTasks.push({
        taskId: body.taskId,
        summary: body.summary,
        timestamp: new Date().toISOString(),
      });
      writePcState(state);
      return NextResponse.json({ status: "ok" });
    }

    // 4. Encolar orden (apagado, reinicio, desarrollo, list_dir, run_pc_cmd, read_file, write_file, obsidian_note)
    if (body.type === "command") {
      if (!state.commands) state.commands = [];
      const newCmd = {
        id: Date.now().toString(),
        action: body.action,
        delaySeconds: body.delaySeconds || 0,
        taskPrompt: body.taskPrompt || null,
        path: body.path || null,
        command: body.command || null,
        content: body.content || null,
        folder: body.folder || null,
        filename: body.filename || null,
        mode: body.mode || null,
        app: body.app || null,
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
