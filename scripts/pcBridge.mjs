import os from "os";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { exec, spawn, execFileSync } from "child_process";

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
    let commandToRun = cmd.command.trim();
    const lower = commandToRun.toLowerCase();

    // Detección inteligente para abrir la aplicación nativa de Gemini en pantalla
    if (lower.includes("gemini.google.com") || lower.includes("start gemini") || lower === "gemini") {
      commandToRun = `Start-Process explorer.exe "C:\\Users\\yesas\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Gemini.lnk"`;
      console.log(`✨ [AUTO-CORRECCIÓN APP GEMINI]: Redirigido a app nativa de escritorio en pantalla.`);
    }

    console.log(`💻 [COMANDO DE CONSOLA EN PC]: ${commandToRun}`);
    const res = await executeSystemCommand(commandToRun);
    const out = (res.stdout || res.stderr || "(ejecutado en pantalla)").trim().slice(0, 1500);
    await sendTaskCompletion(cmd.id, `💻 *Comando en tu PC:* \`${commandToRun}\`\n\`\`\`\n${out}\n\`\`\``);
    return;
  }

  // 6.1. Abrir aplicaciones directamente en la pantalla de Manuel
  if (cmd.action === "open_app") {
    const rawTarget = (cmd.app || cmd.command || "").trim();
    const target = rawTarget.toLowerCase();
    let launchCmd = "";

    if (target.includes("gemini")) {
      launchCmd = `Start-Process explorer.exe "C:\\Users\\yesas\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Gemini.lnk"`;
    } else if (target.includes("obsidian")) {
      launchCmd = `Start-Process explorer.exe "C:\\Users\\yesas\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Obsidian.lnk"`;
    } else if (target.includes("notion")) {
      launchCmd = `Start-Process explorer.exe "C:\\Users\\yesas\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Notion.lnk"`;
    } else if (target.includes("chrome") || target.startsWith("http")) {
      launchCmd = `Start-Process chrome.exe "${rawTarget}"`;
    } else {
      launchCmd = `Start-Process explorer.exe "${rawTarget}"`;
    }

    console.log(`🖥️ [ABRIENDO APLICACIÓN EN PANTALLA]: ${launchCmd}`);
    const res = await executeSystemCommand(launchCmd);
    await sendTaskCompletion(cmd.id, `🖥️ *Aplicación abierta en tu monitor:* \`${rawTarget}\``);
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

// Telemetría en vivo de Git y proyectos locales
let cachedGitTelemetry = [];
let lastGitScanTime = 0;

function getGitTelemetry() {
  const now = Date.now();
  if (now - lastGitScanTime < 15000 && cachedGitTelemetry.length > 0) {
    return cachedGitTelemetry;
  }

  const base = "C:\\PROYECTOS";
  const results = [];
  try {
    if (!fs.existsSync(base)) return results;
    const entries = fs.readdirSync(base, { withFileTypes: true });

    const scanList = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const p = path.join(base, ent.name);
      if (ent.name === "temporal") {
        try {
          const sub = fs.readdirSync(p, { withFileTypes: true });
          for (const s of sub) {
            if (s.isDirectory() && fs.existsSync(path.join(p, s.name, ".git"))) {
              scanList.push({ path: path.join(p, s.name), name: `temporal/${s.name}` });
            }
          }
        } catch {}
      } else if (fs.existsSync(path.join(p, ".git"))) {
        scanList.push({ path: p, name: ent.name });
      }
    }

    for (const item of scanList) {
      try {
        const gitIndex = path.join(item.path, ".git", "index");
        const mtime = fs.existsSync(gitIndex) ? fs.statSync(gitIndex).mtimeMs : 0;

        const branch = execFileSync("git", ["branch", "--show-current"], { cwd: item.path, timeout: 1500, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "HEAD";
        const statusOut = execFileSync("git", ["status", "--short"], { cwd: item.path, timeout: 1500, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
        const logOut = execFileSync("git", ["log", "-1", "--pretty=format:%h|%s|%cr"], { cwd: item.path, timeout: 1500, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

        const parts = logOut.split("|");
        results.push({
          name: item.name,
          branch,
          clean: !statusOut,
          dirtyCount: statusOut ? statusOut.split("\n").length : 0,
          commit: parts[0] || "",
          commitMsg: parts[1] || "",
          commitTime: parts[2] || "",
          mtime
        });
      } catch {}
    }

    results.sort((a, b) => b.mtime - a.mtime);
    cachedGitTelemetry = results;
    lastGitScanTime = now;
  } catch {}

  return cachedGitTelemetry;
}

// Telemetría en vivo de las sesiones y tareas activas de Antigravity
let cachedAgTelemetry = null;
let lastAgScanTime = 0;

function getAntigravityActivity() {
  const now = Date.now();
  if (now - lastAgScanTime < 8000 && cachedAgTelemetry) {
    return cachedAgTelemetry;
  }

  const brainDir = path.join(os.homedir(), ".gemini", "antigravity-ide", "brain");
  if (!fs.existsSync(brainDir)) return null;

  try {
    const folders = fs.readdirSync(brainDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== "tempmediaStorage");

    const convList = [];
    for (const f of folders) {
      const tp = path.join(brainDir, f.name, ".system_generated", "logs", "transcript.jsonl");
      if (fs.existsSync(tp)) {
        convList.push({ path: tp, id: f.name, mtime: fs.statSync(tp).mtimeMs });
      }
    }

    convList.sort((a, b) => b.mtime - a.mtime);

    let chosen = null;
    let lastGoal = "";
    let lastAction = "";

    for (const candidate of convList.slice(0, 5)) {
      try {
        const stats = fs.statSync(candidate.path);
        const fd = fs.openSync(candidate.path, "r");
        const CHUNK = 256 * 1024;
        let pos = stats.size;
        let candGoal = "";
        let candAction = "";
        let remainder = "";

        while (pos > 0 && (!candGoal || !candAction)) {
          const readLen = Math.min(pos, CHUNK);
          pos -= readLen;
          const buf = Buffer.alloc(readLen);
          fs.readSync(fd, buf, 0, readLen, pos);
          const text = buf.toString("utf-8") + remainder;
          const lines = text.split("\n");
          remainder = lines[0];

          for (let i = lines.length - 1; i >= 1; i--) {
            const line = lines[i];
            if (!candAction && line.includes('"PLANNER_RESPONSE"')) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.type === "PLANNER_RESPONSE" && parsed.tool_calls) {
                  candAction = parsed.tool_calls.map(tc => tc.toolAction || tc.name).join(", ");
                }
              } catch {}
            }
            if (!candGoal && line.includes('"USER_INPUT"')) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.type === "USER_INPUT" && parsed.content) {
                  let text = parsed.content;
                  if (text.includes("<USER_REQUEST>")) {
                    text = text.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0];
                  }
                  candGoal = text.split("<ADDITIONAL_METADATA>")[0].trim().slice(0, 300);
                }
              } catch {}
            }
            if (candGoal && candAction) break;
          }
        }
        fs.closeSync(fd);

        if (candGoal) {
          chosen = candidate;
          lastGoal = candGoal;
          lastAction = candAction;
          break;
        }
      } catch {}
    }

    if (!chosen && convList.length > 0) {
      chosen = convList[0];
    }

    if (!chosen) return null;

    const minutesAgo = Math.round((now - chosen.mtime) / 60000);

    cachedAgTelemetry = {
      activeSessionId: chosen.id,
      minutesAgo,
      lastGoal: lastGoal || "Sesión activa en el IDE de Antigravity",
      lastAction: lastAction || "En ejecución",
      timestamp: new Date(chosen.mtime).toISOString()
    };
    lastAgScanTime = now;
  } catch {}

  return cachedAgTelemetry;
}

async function sendHeartbeat() {
  try {
    const gitTelemetry = getGitTelemetry();
    const agTelemetry = getAntigravityActivity();

    const payload = {
      type: "heartbeat",
      hostname: os.hostname(),
      uptime: Math.round(os.uptime()),
      platform: os.platform(),
      proyectos: getProyectosList(),
      gitActivity: gitTelemetry.slice(0, 8),
      antigravity: agTelemetry,
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

