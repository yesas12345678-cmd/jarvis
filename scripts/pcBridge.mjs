import os from "os";
import path from "path";
import fs from "fs";
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
    const isWin = process.platform === "win32";
    exec(cmd, isWin ? { shell: "powershell.exe" } : {}, (error, stdout, stderr) => {
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

let pendingPowerTimer = null;

async function handleCommand(cmd) {
  console.log(`\n🔔 [ORDEN RECIBIDA DESDE TELEGRAM]:`, cmd);

  // 1. Hibernación del PC (Guarda toda la sesión y ventanas abiertas sin cerrar nada)
  if (cmd.action === "hibernate") {
    const delay = parseInt(cmd.delaySeconds, 10) || 5;
    console.log(`💤 [HIBERNANDO PC] Hibernación programada en ${delay} segundos (conservando sesión)...`);
    if (pendingPowerTimer) clearTimeout(pendingPowerTimer);
    pendingPowerTimer = setTimeout(async () => {
      pendingPowerTimer = null;
      console.log("💤 Ejecutando shutdown /h...");
      const res = await executeSystemCommand(`shutdown /h`);
      console.log("Resultado hibernate:", res);
    }, delay * 1000);
    return;
  }

  // 2. Apagado clásico del PC
  if (cmd.action === "shutdown") {
    const delay = parseInt(cmd.delaySeconds, 10) || 5;
    console.log(`🛑 [APAGANDO PC] Apagado programado en ${delay} segundos...`);
    const res = await executeSystemCommand(`shutdown /s /t ${delay} /c "Orden de apagado recibida desde Telegram por Jude"`);
    console.log("Resultado shutdown:", res);
    return;
  }

  // 3. Cancelación de apagado o hibernación
  if (cmd.action === "cancel_shutdown" || cmd.action === "cancel_hibernate") {
    console.log(`↩️ [CANCELANDO] Cancelando orden de apagado / hibernación en curso...`);
    if (pendingPowerTimer) {
      clearTimeout(pendingPowerTimer);
      pendingPowerTimer = null;
      console.log("Temporizador de hibernación cancelado.");
    }
    const res = await executeSystemCommand(`shutdown /a`);
    console.log("Resultado cancelar shutdown:", res);
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
    return;
  }

  // 5. Listar directorios del PC
  if (cmd.action === "list_dir") {
    const targetPath = cmd.path || "C:\\PROYECTOS";
    console.log(`📂 [LISTANDO DIRECTORIO EN PC]: ${targetPath}`);
    try {
      if (!fs.existsSync(targetPath)) {
        await sendTaskCompletion(cmd.id, `⚠️ La ruta \`${targetPath}\` no existe en tu PC.`);
        return;
      }
      const items = fs.readdirSync(targetPath, { withFileTypes: true });
      const dirs = items.filter(i => i.isDirectory()).map(i => `📁 \`${i.name}\``);
      const files = items.filter(i => !i.isDirectory()).map(i => `📄 \`${i.name}\``);
      const summary = `📂 *Carpetas y archivos en tu PC (\`${targetPath}\`):*\n\n` +
        (dirs.length > 0 ? `*Carpetas (${dirs.length}):*\n${dirs.slice(0, 35).join("\n")}\n\n` : "") +
        (files.length > 0 ? `*Archivos (${files.length}):*\n${files.slice(0, 20).join("\n")}` : "");
      await sendTaskCompletion(cmd.id, summary);
    } catch (e) {
      await sendTaskCompletion(cmd.id, `Error al leer \`${targetPath}\`: ${e.message}`);
    }
    return;
  }

  // 6. Ejecutar comando en la consola del PC
  if (cmd.action === "run_pc_cmd" && cmd.command) {
    console.log(`💻 [COMANDO DE CONSOLA EN PC]: ${cmd.command}`);
    const res = await executeSystemCommand(cmd.command);
    const out = (res.stdout || res.stderr || "(sin salida)").trim().slice(0, 1500);
    await sendTaskCompletion(cmd.id, `💻 *Comando en tu PC:* \`${cmd.command}\`\n\`\`\`\n${out}\n\`\`\``);
    return;
  }

  // 7. Gestión Autónoma de Obsidian (Segundo Cerebro)
  if (cmd.action === "obsidian_note") {
    const vaultPath = "C:\\PROYECTOS\\Segundo Cerebro";
    const folder = cmd.folder || "05 - Diario";
    const filename = cmd.filename || `Nota_${new Date().toISOString().slice(0, 10)}.md`;
    const targetDir = path.join(vaultPath, folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const fullPath = path.join(targetDir, filename.endsWith(".md") ? filename : `${filename}.md`);
    const content = cmd.content || "";
    
    try {
      if (cmd.mode === "append" && fs.existsSync(fullPath)) {
        fs.appendFileSync(fullPath, `\n\n${content}`, "utf-8");
      } else {
        fs.writeFileSync(fullPath, content, "utf-8");
      }
      console.log(`🧠 [OBSIDIAN NOTA ACTUALIZADA]: ${fullPath}`);
      await sendTaskCompletion(cmd.id, `🧠 *Nota registrada en tu Segundo Cerebro:* \`${folder}/${filename}\``);
    } catch (e) {
      await sendTaskCompletion(cmd.id, `⚠️ Error al escribir nota en Obsidian: ${e.message}`);
    }
    return;
  }

  // 8. Lectura de archivos en el PC
  if (cmd.action === "read_file" && cmd.path) {
    console.log(`📄 [LEYENDO ARCHIVO EN PC]: ${cmd.path}`);
    try {
      if (!fs.existsSync(cmd.path)) {
        await sendTaskCompletion(cmd.id, `⚠️ El archivo \`${cmd.path}\` no existe en tu PC.`);
        return;
      }
      const stats = fs.statSync(cmd.path);
      if (stats.size > 2000000) {
        await sendTaskCompletion(cmd.id, `⚠️ El archivo \`${cmd.path}\` es demasiado grande (${Math.round(stats.size / 1024)} KB) para mostrarlo en Telegram.`);
        return;
      }
      const raw = fs.readFileSync(cmd.path, "utf-8");
      const preview = raw.length > 2500 ? raw.slice(0, 2500) + "\n\n... (contenido restante truncado)" : raw;
      await sendTaskCompletion(cmd.id, `📄 *Contenido de* \`${path.basename(cmd.path)}\`:\n\`\`\`\n${preview}\n\`\`\``);
    } catch (e) {
      await sendTaskCompletion(cmd.id, `⚠️ Error al leer \`${cmd.path}\`: ${e.message}`);
    }
    return;
  }

  // 9. Escritura / Edición de archivos en el PC
  if (cmd.action === "write_file" && cmd.path) {
    console.log(`✏️ [ESCRIBIENDO ARCHIVO EN PC]: ${cmd.path}`);
    try {
      const dir = path.dirname(cmd.path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(cmd.path, cmd.content || "", "utf-8");
      await sendTaskCompletion(cmd.id, `✅ *Archivo guardado con éxito en tu PC:* \`${cmd.path}\``);
    } catch (e) {
      await sendTaskCompletion(cmd.id, `⚠️ Error al escribir \`${cmd.path}\`: ${e.message}`);
    }
    return;
  }
}

function getProyectosList() {
  try {
    const pPath = "C:\\PROYECTOS";
    if (fs.existsSync(pPath)) {
      return fs.readdirSync(pPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    }
  } catch {}
  return [];
}

async function sendHeartbeat() {
  try {
    const payload = {
      type: "heartbeat",
      hostname: os.hostname(),
      uptime: Math.round(os.uptime()),
      platform: os.platform(),
      proyectos: getProyectosList(),
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
