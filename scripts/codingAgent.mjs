import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { GoogleGenerativeAI } from "@google/generative-ai";

const WORKSPACE_DIR = path.join(process.cwd(), "workspace");
if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

// Helper para ejecutar comandos de terminal en el servidor
export function runTerminalCommand(command, cwd = WORKSPACE_DIR) {
  return new Promise((resolve) => {
    // Comprobación de seguridad básica contra comandos destructivos del sistema
    const forbidden = ["rm -rf /", "mkfs", ":(){ :|:& };:", "dd if=/dev/zero", "shutdown", "reboot"];
    if (forbidden.some((f) => command.includes(f))) {
      return resolve({
        success: false,
        stdout: "",
        stderr: "⛔ Comando bloqueado por políticas de seguridad del sistema.",
        code: 1,
      });
    }

    exec(
      command,
      {
        cwd,
        timeout: 90000,
        maxBuffer: 1024 * 1024 * 4,
        env: { ...process.env, PATH: process.env.PATH },
      },
      (error, stdout, stderr) => {
        resolve({
          success: !error,
          stdout: stdout ? stdout.toString() : "",
          stderr: stderr ? stderr.toString() : error ? error.message : "",
          code: error && error.code ? error.code : 0,
        });
      }
    );
  });
}

// Gestión de archivos en el workspace
export function writeProjectFile(filePath, content) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE_DIR, filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, content, "utf-8");
  return { success: true, path: fullPath, size: Buffer.byteLength(content, "utf-8") };
}

export function readProjectFile(filePath) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    return { success: false, error: `El archivo ${filePath} no existe.` };
  }
  const content = fs.readFileSync(fullPath, "utf-8");
  return { success: true, content };
}

export function listProjectFiles(dirPath = "") {
  const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(WORKSPACE_DIR, dirPath);
  if (!fs.existsSync(fullPath)) {
    return { success: false, files: [] };
  }

  function scan(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const item of list) {
      if (item === "node_modules" || item === ".git") continue;
      const p = path.join(dir, item);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        results.push({ name: item, type: "dir", path: path.relative(WORKSPACE_DIR, p) });
        results = results.concat(scan(p));
      } else {
        results.push({ name: item, type: "file", size: stat.size, path: path.relative(WORKSPACE_DIR, p) });
      }
    }
    return results;
  }

  return { success: true, files: scan(fullPath) };
}

// Bucle Autónomo de Programación con Gemini
export async function runAutonomousCodingAgent({
  taskPrompt,
  geminiApiKey,
  composioSession,
  onProgress = async () => {},
}) {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash",
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  await onProgress("🧠 *Iniciando Agente Programador Jude...*\nAnalizando requerimiento y planificando pasos de desarrollo.");

  const conversation = [
    {
      role: "user",
      parts: [
        {
          text: `
Eres Jude, el Agente de Programación y Desarrollo Autónomo de Manuel (Vaita).
Tu objetivo es resolver completamente la siguiente solicitud de código o proyecto:
"${taskPrompt}"

DIRECTORIO DE TRABAJO:
- Los proyectos se guardan en el workspace local: \`/app/workspace\`.
- Tienes acceso completo a bash, git, node, python3 y npm.

FORMATO DE ACCIONES (Responde ÚNICAMENTE en JSON válido con una de estas acciones en cada turno):

1. Escribir/crear archivo:
{
  "thought": "Explicación breve de lo que vas a programar en este paso",
  "action": "write_file",
  "filePath": "nombre-proyecto/archivo.ext",
  "content": "código completo y funcional sin omitir partes"
}

2. Ejecutar comando de terminal:
{
  "thought": "Explicación de por qué ejecutas este comando",
  "action": "run_cmd",
  "command": "npm install / python script.py / git status / etc",
  "cwd": "ruta opcional relativa al workspace o dejar vacio para raiz del workspace"
}

3. Leer archivo existente:
{
  "thought": "Por qué necesitas leer este archivo",
  "action": "read_file",
  "filePath": "ruta/al/archivo"
}

4. Crear repositorio en GitHub de Manuel (yesas12345678-cmd):
{
  "thought": "Crear un nuevo repositorio remoto en GitHub",
  "action": "github_create_repo",
  "name": "nombre-del-repo",
  "description": "descripción",
  "isPrivate": false
}

5. Subir o commitear archivo a GitHub de Manuel:
{
  "thought": "Subir archivo directamente al repo de GitHub",
  "action": "github_commit",
  "repo": "nombre-del-repo",
  "path": "README.md",
  "content": "contenido del archivo",
  "message": "Commit descriptivo"
}

6. Tarea finalizada con éxito:
{
  "thought": "Todo el código ha sido creado, probado y completado",
  "action": "finish",
  "summary": "Resumen claro de lo que programaste, archivos creados, resultados de pruebas y enlaces si aplica"
}

Regla: No te detengas hasta que el código esté escrito, probado y completamente operativo.
`,
        },
      ],
    },
  ];

  let maxSteps = 8;
  let currentStep = 0;
  let finalSummary = "";

  while (currentStep < maxSteps) {
    currentStep++;
    let stepOutput = null;

    try {
      const chat = model.startChat({ history: conversation.slice(0, -1) });
      const lastMsg = conversation[conversation.length - 1];
      const result = await chat.sendMessage(lastMsg.parts[0].text);
      const replyText = result.response.text();

      let plan;
      try {
        plan = JSON.parse(replyText);
      } catch (parseErr) {
        throw new Error(`Error interpretando JSON de acción: ${replyText}`);
      }

      conversation.push({
        role: "model",
        parts: [{ text: replyText }],
      });

      if (plan.thought) {
        await onProgress(`⚙️ *Paso ${currentStep}:* ${plan.thought}`);
      }

      // Ejecutar la acción solicitada
      if (plan.action === "finish") {
        finalSummary = plan.summary;
        break;
      }

      if (plan.action === "write_file") {
        const res = writeProjectFile(plan.filePath, plan.content);
        stepOutput = `Archivo guardado exitosamente en ${plan.filePath} (${res.size} bytes).`;
        await onProgress(`📝 *Archivo creado:* \`${plan.filePath}\``);
      } else if (plan.action === "run_cmd") {
        const cmdCwd = plan.cwd ? path.join(WORKSPACE_DIR, plan.cwd) : WORKSPACE_DIR;
        const res = await runTerminalCommand(plan.command, cmdCwd);
        stepOutput = `Código salida: ${res.code}\nSTDOUT:\n${res.stdout || "(vacio)"}\nSTDERR:\n${res.stderr || "(vacio)"}`;
        if (res.stdout) {
          const preview = res.stdout.trim().slice(0, 150);
          await onProgress(`💻 *Terminal:* \`${plan.command}\`\n\`\`\`\n${preview}\n\`\`\``);
        }
      } else if (plan.action === "read_file") {
        const res = readProjectFile(plan.filePath);
        stepOutput = res.success ? `CONTENIDO DE ${plan.filePath}:\n${res.content}` : `Error: ${res.error}`;
      } else if (plan.action === "github_create_repo") {
        if (!composioSession) {
          stepOutput = "Error: Sesión de Composio no disponible para interactuar con GitHub.";
        } else {
          try {
            const res = await composioSession.execute("GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER", {
              name: plan.name,
              description: plan.description || "Creado por Jude Autonomous Agent",
              private: !!plan.isPrivate,
            });
            stepOutput = `Repositorio GitHub creado con éxito: ${res?.data?.html_url || plan.name}`;
            await onProgress(`🐙 *Repositorio creado en GitHub:* [${plan.name}](${res?.data?.html_url || "#"})`);
          } catch (ghErr) {
            stepOutput = `Error creando repo en GitHub: ${ghErr.message}`;
          }
        }
      } else if (plan.action === "github_commit") {
        if (!composioSession) {
          stepOutput = "Error: Sesión de Composio no disponible para interactuar con GitHub.";
        } else {
          try {
            const b64 = Buffer.from(plan.content, "utf-8").toString("base64");
            const res = await composioSession.execute("GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS", {
              owner: "yesas12345678-cmd",
              repo: plan.repo,
              path: plan.path,
              message: plan.message || "Update from Jude",
              content: b64,
            });
            stepOutput = `Archivo subido a GitHub exitosamente: ${plan.path}`;
            await onProgress(`🚀 *Commit subido a GitHub:* \`${plan.path}\` en \`${plan.repo}\``);
          } catch (ghErr) {
            stepOutput = `Error subiendo archivo a GitHub: ${ghErr.message}`;
          }
        }
      } else {
        stepOutput = `Acción desconocida: ${plan.action}`;
      }

      // Siguiente turno con el resultado obtenido
      conversation.push({
        role: "user",
        parts: [{ text: `RESULTADO DE LA ACCIÓN PREVIA:\n${stepOutput}\n\nDetermina el siguiente paso necesario o si has terminado ('finish').` }],
      });
    } catch (loopErr) {
      console.error("[DEV AGENT ERROR]", loopErr);
      await onProgress(`⚠️ *Incidencia en paso ${currentStep}:* ${loopErr.message}`);
      break;
    }
  }

  if (!finalSummary) {
    finalSummary = `Se completaron ${currentStep} pasos en el proyecto. Los archivos generados se encuentran en el workspace del servidor.`;
  }

  return finalSummary;
}
