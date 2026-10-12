import { spawn } from "child_process";

console.log("=================================================");
console.log("🚀 [JUDE DOCKER RUNNER] Iniciando servicios...");
console.log("=================================================");

// 1. Iniciar servidor Next.js
const webProcess = spawn("npm", ["run", "start"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

webProcess.on("error", (err) => {
  console.error("❌ Error en servidor web:", err);
});

// 2. Iniciar Bot de Telegram si está configurado
let telegramProcess = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
  console.log("🤖 [TELEGRAM] Token detectado, arrancando bot de Telegram...");
  telegramProcess = spawn("node", ["scripts/telegramBot.mjs"], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  telegramProcess.on("error", (err) => {
    console.error("❌ Error en bot de Telegram:", err);
  });
} else {
  console.log("ℹ️  TELEGRAM_BOT_TOKEN no definido. Omitiendo bot de Telegram.");
}

// Manejo de apagado elegante (Graceful Shutdown)
function handleShutdown(signal) {
  console.log(`\n🛑 Recibida señal ${signal}. Deteniendo servicios de Jude...`);
  if (webProcess) webProcess.kill(signal);
  if (telegramProcess) telegramProcess.kill(signal);
  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
