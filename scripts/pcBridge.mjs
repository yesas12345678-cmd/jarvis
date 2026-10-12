import os from "os";
import path from "path";
import dotenv from "dotenv";
import { exec, spawn } from "child_process";

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

  // 4. DESARROLLO DE SOFTWARE AUTÓNOMO EN EL PC — POTENCIADO POR ANTIGRAVITY
  if (cmd.action === "code_task" && cmd.taskPrompt) {
    console.log(`🚀 [ANTIGRAVITY AGENT] Tarea recibida: ${cmd.taskPrompt}`);
    await sendProgressReport(cmd.id, `🧠 *[ANTIGRAVITY EN TU PC]* Lanzando agente con todas las herramientas de Antigravity SDK...\n\n🎯 _${cmd.taskPrompt}_`);

    try {
      const scriptPath = path.join(process.cwd(), "scripts", "antigravityAgent.py");
      const summary = await new Promise((resolve, reject) => {
        const child = spawn("python", [
          scriptPath,
          "--task", cmd.taskPrompt,
          "--cwd", process.cwd(),
          "--output-json",
        ], {
          cwd: process.cwd(),
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        });

        let output = "";
        let lastReport = Date.now();

        child.stdout.on("data", async (data) => {
          const text = data.toString("utf-8");
          output += text;
          process.stdout.write(text);

          // Enviar actualizaciones a Telegram cada 8 segundos
          if (Date.now() - lastReport > 8000) {
            lastReport = Date.now();
            const lines = output.trim().split("\n");
            const lastLines = lines.slice(-5).join("\n");
            await sendProgressReport(cmd.id, `🖥️ *[ANTIGRAVITY]* Progreso:\n\`\`\`\n${lastLines.slice(0, 500)}\n\`\`\``);
          }
        });

        child.stderr.on("data", (data) => {
          process.stderr.write(data.toString("utf-8"));
        });

        child.on("close", (code) => {
          if (code === 0) {
            // Buscar JSON de resultado al final
            const jsonMarker = "__RESULT_JSON__";
            const jsonIdx = output.indexOf(jsonMarker);
            if (jsonIdx !== -1) {
              try {
                const jsonStr = output.slice(jsonIdx + jsonMarker.length).trim();
                const result = JSON.parse(jsonStr);
                resolve(result.summary || "Tarea completada por Antigravity.");
              } catch {
                resolve("✅ Tarea completada por Antigravity (sin JSON estructurado).");
              }
            } else {
              // Usar las últimas líneas como resumen
              const lines = output.trim().split("\n");
              resolve(lines.slice(-10).join("\n").slice(0, 1500));
            }
          } else {
            reject(new Error(`Antigravity Agent finalizó con código ${code}`));
          }
        });

        child.on("error", (err) => reject(err));
      });

      console.log(`✅ [ANTIGRAVITY AGENT] Tarea completada:`, summary);
      await sendTaskCompletion(cmd.id, `🧠 *Antigravity ha completado la tarea en tu PC:*\n\n${summary}`);
    } catch (err) {
      console.error(`❌ [ANTIGRAVITY AGENT ERROR]:`, err);
      await sendProgressReport(cmd.id, `⚠️ *[ERROR ANTIGRAVITY]*: ${err.message}`);
      await sendTaskCompletion(cmd.id, `No se pudo completar: ${err.message}`);
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
