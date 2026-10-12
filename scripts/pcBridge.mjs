import os from "os";
import path from "path";
import dotenv from "dotenv";
import { exec } from "child_process";
import { runAutonomousCodingAgent } from "./codingAgent.mjs";

dotenv.config();

const VPS_URL = process.env.VPS_URL || "http://187.127.233.89:3001";
const BRIDGE_ENDPOINT = `${VPS_URL}/api/pc-bridge`;
const POLL_INTERVAL = 4000; // cada 4 segundos
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log("=================================================");
console.log("⚡ [JUDE PC BRIDGE] Puente de Control y Código Iniciado");
console.log(`   Host: ${os.hostname()} (${os.platform()})`);
console.log(`   Directorio base: ${process.cwd()}`);
console.log(`   Servidor VPS: ${BRIDGE_ENDPOINT}`);
console.log("=================================================");

function executeSystemCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      resolve({ success: !error, stdout, stderr, code: error ? error.code : 0 });
    });
  });
}

async function sendProgressReport(taskId, message) {
  try {
    await fetch(BRIDGE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "progress", taskId, message }),
    });
  } catch {}
}

async function sendTaskCompletion(taskId, summary) {
  try {
    await fetch(BRIDGE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "task_complete", taskId, summary }),
    });
  } catch {}
}

async function handleCommand(cmd) {
  console.log(`\n🔔 [ORDEN RECIBIDA DESDE TELEGRAM]:`, cmd);

  // 1. Apagado del PC
  if (cmd.action === "shutdown") {
    const delay = parseInt(cmd.delaySeconds, 10) || 5;
    console.log(`🛑 [APAGANDO PC] Apagado programado en ${delay} segundos...`);
    const res = await executeSystemCommand(`shutdown /s /t ${delay} /c "Orden de apagado recibida desde Telegram por Jude"`);
    console.log("Resultado shutdown:", res);
    return;
  }

  // 2. Cancelación de apagado
  if (cmd.action === "cancel_shutdown") {
    console.log(`↩️ [CANCELANDO APAGADO] Cancelando apagado en curso...`);
    const res = await executeSystemCommand(`shutdown /a`);
    console.log("Resultado cancelar:", res);
    return;
  }

  // 3. Reinicio
  if (cmd.action === "restart") {
    const delay = parseInt(cmd.delaySeconds, 10) || 5;
    console.log(`🔄 [REINICIANDO PC] Reinicio en ${delay} segundos...`);
    const res = await executeSystemCommand(`shutdown /r /t ${delay}`);
    console.log("Resultado restart:", res);
    return;
  }

  // 4. DESARROLLO DE SOFTWARE AUTÓNOMO EN EL PC
  if (cmd.action === "code_task" && cmd.taskPrompt) {
    console.log(`🚀 [TAREA DE PROGRAMACIÓN EN TU PC]: ${cmd.taskPrompt}`);
    await sendProgressReport(cmd.id, `💻 *[TU PC EN CASA]* Ha tomado el control. Iniciando desarrollo local en \`${process.cwd()}\`...`);

    try {
      const summary = await runAutonomousCodingAgent({
        taskPrompt: cmd.taskPrompt,
        geminiApiKey: GEMINI_API_KEY,
        onProgress: async (update) => {
          console.log(`[PROGRESO PC] ${update}`);
          await sendProgressReport(cmd.id, `🖥️ *[TU PC]* ${update}`);
        },
      });

      console.log(`✅ [TAREA COMPLETADA EN PC]:`, summary);
      await sendTaskCompletion(cmd.id, summary);
    } catch (err) {
      console.error(`❌ [ERROR EN PC]:`, err);
      await sendProgressReport(cmd.id, `⚠️ *[ERROR EN TU PC]*: ${err.message}`);
      await sendTaskCompletion(cmd.id, `No se pudo completar la tarea en el PC: ${err.message}`);
    }
  }
}

async function sendHeartbeat() {
  try {
    const payload = {
      type: "heartbeat",
      hostname: os.hostname(),
      uptime: Math.round(os.uptime()),
      platform: os.platform(),
    };

    const res = await fetch(BRIDGE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.commands && data.commands.length > 0) {
        for (const cmd of data.commands) {
          await handleCommand(cmd);
        }
      }
    }
  } catch (err) {
    // Reintento silencioso si el VPS está compilando
  }
}

setInterval(sendHeartbeat, POLL_INTERVAL);
sendHeartbeat();
