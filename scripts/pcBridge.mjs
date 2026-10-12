import os from "os";
import { exec } from "child_process";

// URL del servidor VPS de Jude
const VPS_URL = process.env.VPS_URL || "http://187.127.233.89:3001";
const BRIDGE_ENDPOINT = `${VPS_URL}/api/pc-bridge`;
const POLL_INTERVAL = 5000; // cada 5 segundos

console.log("=================================================");
console.log("⚡ [JUDE PC BRIDGE] Puente de Control de PC Iniciado");
console.log(`   Host: ${os.hostname()} (${os.platform()})`);
console.log(`   Servidor VPS: ${BRIDGE_ENDPOINT}`);
console.log("=================================================");

function executeSystemCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      resolve({ success: !error, stdout, stderr, code: error ? error.code : 0 });
    });
  });
}

async function handleCommand(cmd) {
  console.log(`\n🔔 [ORDEN RECIBIDA DESDE TELEGRAM]:`, cmd);

  if (cmd.action === "shutdown") {
    const delay = parseInt(cmd.delaySeconds, 10) || 5;
    console.log(`🛑 [APAGANDO PC] Apagado programado en ${delay} segundos...`);
    const res = await executeSystemCommand(`shutdown /s /t ${delay} /c "Orden de apagado recibida desde Telegram por Jude"`);
    console.log("Resultado shutdown:", res);
  } else if (cmd.action === "cancel_shutdown") {
    console.log(`↩️ [CANCELANDO APAGADO] Cancelando apagado en curso...`);
    const res = await executeSystemCommand(`shutdown /a`);
    console.log("Resultado cancelar:", res);
  } else if (cmd.action === "restart") {
    const delay = parseInt(cmd.delaySeconds, 10) || 5;
    console.log(`🔄 [REINICIANDO PC] Reinicio en ${delay} segundos...`);
    const res = await executeSystemCommand(`shutdown /r /t ${delay}`);
    console.log("Resultado restart:", res);
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
    // Si el VPS está reiniciando temporalmente, no romper el loop
    // console.warn("Fallo conectando al VPS:", err.message);
  }
}

// Iniciar latido constante
setInterval(sendHeartbeat, POLL_INTERVAL);
sendHeartbeat();
