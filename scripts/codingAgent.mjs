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
        timeout: 180000,
        maxBuffer: 1024 * 1024 * 8,
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

// Gestión quirúrgica de archivos en el workspace
export function writeProjectFile(filePath, content) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE_DIR, filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, content, "utf-8");
  return { success: true, path: fullPath, size: Buffer.byteLength(content, "utf-8") };
}

export function readProjectFile(filePath, startLine = null, endLine = null) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    return { success: false, error: `El archivo ${filePath} no existe.` };
  }
  const content = fs.readFileSync(fullPath, "utf-8");
  if (startLine !== null && endLine !== null) {
    const lines = content.split("\n");
    const sliced = lines.slice(Math.max(0, startLine - 1), endLine).join("\n");
    return { success: true, content: sliced, totalLines: lines.length };
  }
  return { success: true, content };
}

export function replaceInProjectFile(filePath, targetContent, replacementContent) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    return { success: false, error: `El archivo ${filePath} no existe.` };
  }
  const original = fs.readFileSync(fullPath, "utf-8");
  if (!original.includes(targetContent)) {
    return { success: false, error: "El fragmento objetivo no se encontró de forma exacta en el archivo." };
  }
  const updated = original.replace(targetContent, replacementContent);
  fs.writeFileSync(fullPath, updated, "utf-8");
  return { success: true, path: fullPath };
}

export function grepInProject(query, dirPath = "") {
  const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(WORKSPACE_DIR, dirPath);
  if (!fs.existsSync(fullPath)) return { success: false, matches: [] };

  const matches = [];
  function search(dir) {
    const list = fs.readdirSync(dir);
    for (const item of list) {
      if (item === "node_modules" || item === ".git" || item === ".next" || item === "dist") continue;
      const p = path.join(dir, item);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        search(p);
      } else {
        try {
          const content = fs.readFileSync(p, "utf-8");
          const lines = content.split("\n");
          lines.forEach((line, idx) => {
            if (line.toLowerCase().includes(query.toLowerCase())) {
              matches.push({
                file: path.relative(WORKSPACE_DIR, p),
                line: idx + 1,
                content: line.trim(),
              });
            }
          });
        } catch {}
      }
    }
  }

  search(fullPath);
  return { success: true, matches: matches.slice(0, 50) };
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
      if (item === "node_modules" || item === ".git" || item === ".next" || item === "dist") continue;
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

// Invocación a Gemini con reintentos exponenciales y cambio automático de modelo ante 503/429
async function queryGeminiWithRetry(genAI, history, userMsg, retryCount = 0) {
  const candidateModels = ["gemini-3.5-flash-lite", "gemini-3.5-flash"];
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      });

      const chat = model.startChat({ history });
      const res = await chat.sendMessage(userMsg);
      const reply = res.response.text();
      if (reply) return reply;
    } catch (err) {
      lastError = err;
      console.warn(`[GEMINI_DEV_WARN] Fallo temporal en ${modelName}:`, err.message);
    }
  }

  // Si fallan ambos por sobrecarga temporal (503/429), reintentar hasta 3 veces
  if (retryCount < 3) {
    console.log(`[GEMINI_RETRY] Reintentando paso tras 503/429 en ${3 * (retryCount + 1)}s...`);
    await new Promise((r) => setTimeout(r, 3000 * (retryCount + 1)));
    return await queryGeminiWithRetry(genAI, history, userMsg, retryCount + 1);
  }

  throw lastError || new Error("No se pudo conectar con los modelos de Gemini tras varios reintentos.");
}

// Bucle Autónomo de Programación de Gran Escala con Gemini
export async function runAutonomousCodingAgent({
  taskPrompt,
  geminiApiKey,
  composioSession,
  onProgress = async () => {},
}) {
  const genAI = new GoogleGenerativeAI(geminiApiKey);

  await onProgress("🏗️ *Iniciando Agente Programador de Gran Escala Jude...*\nDiseñando arquitectura completa, plan de módulos y dependencias.");

  const conversation = [
    {
      role: "user",
      parts: [
        {
          text: `
Eres Jude, el Agente de Desarrollo de Software de Nivel Senior y Alta Capacidad de Manuel (Vaita).
Tu misión es construir proyectos completos de cualquier escala y complejidad para cumplir este objetivo:
"${taskPrompt}"

CAPACIDADES DEL ENTORNO DE EJECUCIÓN (VPS):
- Directorio de proyectos: \`/app/workspace\`.
- Herramientas instaladas: bash, git, node, npm, python3, pip, curl.
- Acceso a GitHub de Manuel: cuenta \`yesas12345678-cmd\`.

FLUJO DE TRABAJO PARA PROYECTOS GRANDES:
1. Arquitectura & Estructura: Planifica los archivos y carpetas necesarios (scaffolding).
2. Dependencias: Inicializa paquetes (package.json / requirements.txt) e instálalos si se requieren.
3. Implementación completa: Escribe código modular, robusto y sin placeholders incompletos.
4. Pruebas y Depuración: Ejecuta el código (node, python3, npm test, etc.) para comprobar que compila y corre con código de salida 0. Si hay error, corrígelo.
5. GitHub: Si el usuario pidió subir a GitHub o crear repositorio, créalo y sube los archivos.

ACCIONES DISPONIBLES (Responde EXCLUSIVAMENTE en JSON válido con una acción por turno):

- Escribir o crear archivo:
{"thought": "...", "action": "write_file", "filePath": "proyecto/archivo.ext", "content": "..."}

- Modificación quirúrgica de archivo existente:
{"thought": "...", "action": "replace_in_file", "filePath": "proyecto/archivo.ext", "target": "código a cambiar", "replacement": "nuevo código"}

- Leer archivo (opcional rango de líneas):
{"thought": "...", "action": "read_file", "filePath": "...", "startLine": 1, "endLine": 100}

- Búsqueda de código (grep):
{"thought": "...", "action": "grep", "query": "palabra o función", "dirPath": ""}

- Ejecutar comando de consola:
{"thought": "...", "action": "run_cmd", "command": "npm install / python app.py / etc", "cwd": "ruta opcional"}

- Listar estructura de directorios:
{"thought": "...", "action": "list_dir", "dirPath": ""}

- Crear repositorio en GitHub de Manuel:
{"thought": "...", "action": "github_create_repo", "name": "nombre", "description": "...", "isPrivate": false}

- Subir/Commitear archivo a GitHub de Manuel:
{"thought": "...", "action": "github_commit", "repo": "nombre-repo", "path": "ruta/archivo", "content": "...", "message": "..."}

- Finalizar proyecto:
{"thought": "...", "action": "finish", "summary": "Informe completo y exhaustivo del proyecto: arquitectura creada, archivos generados, resultados de pruebas en terminal y enlaces a GitHub si aplica."}
`,
        },
      ],
    },
  ];

  const maxSteps = 40;
  let currentStep = 0;
  let finalSummary = "";

  while (currentStep < maxSteps) {
    currentStep++;
    let stepOutput = null;

    try {
      const history = conversation.slice(0, -1);
      const lastMsg = conversation[conversation.length - 1].parts[0].text;

      const replyText = await queryGeminiWithRetry(genAI, history, lastMsg);

      let plan;
      try {
        const cleaned = replyText.replace(/```json/gi, "").replace(/```/g, "").trim();
        plan = JSON.parse(cleaned);
      } catch (parseErr) {
        throw new Error(`Error interpretando JSON de acción: ${replyText}`);
      }

      conversation.push({
        role: "model",
        parts: [{ text: replyText }],
      });

      if (plan.thought) {
        await onProgress(`⚙️ *Paso ${currentStep}/${maxSteps}:* ${plan.thought}`);
      }

      // Ejecución de acciones
      if (plan.action === "finish") {
        finalSummary = plan.summary;
        break;
      }

      if (plan.action === "write_file") {
        const res = writeProjectFile(plan.filePath, plan.content);
        stepOutput = `Archivo guardado exitosamente en ${plan.filePath} (${res.size} bytes).`;
        await onProgress(`📝 *Archivo creado/actualizado:* \`${plan.filePath}\``);
      } else if (plan.action === "replace_in_file") {
        const res = replaceInProjectFile(plan.filePath, plan.target, plan.replacement);
        stepOutput = res.success ? `Modificación aplicada en ${plan.filePath}.` : `Error: ${res.error}`;
        if (res.success) {
          await onProgress(`🔧 *Edición aplicada:* \`${plan.filePath}\``);
        }
      } else if (plan.action === "read_file") {
        const res = readProjectFile(plan.filePath, plan.startLine, plan.endLine);
        stepOutput = res.success ? `CONTENIDO DE ${plan.filePath}:\n${res.content}` : `Error: ${res.error}`;
      } else if (plan.action === "grep") {
        const res = grepInProject(plan.query, plan.dirPath || "");
        stepOutput = `COINCIDENCIAS (${res.matches.length}):\n` + JSON.stringify(res.matches, null, 2);
      } else if (plan.action === "list_dir") {
        const res = listProjectFiles(plan.dirPath || "");
        stepOutput = `ARCHIVOS EXISTENTES:\n` + JSON.stringify(res.files.map((f) => f.path), null, 2);
      } else if (plan.action === "run_cmd") {
        const cmdCwd = plan.cwd ? path.join(WORKSPACE_DIR, plan.cwd) : WORKSPACE_DIR;
        const res = await runTerminalCommand(plan.command, cmdCwd);
        stepOutput = `Código salida: ${res.code}\nSTDOUT:\n${res.stdout || "(vacio)"}\nSTDERR:\n${res.stderr || "(vacio)"}`;
        if (res.stdout || res.stderr) {
          const preview = (res.stdout || res.stderr).trim().slice(0, 180);
          await onProgress(`💻 *Terminal:* \`${plan.command}\`\n\`\`\`\n${preview}\n\`\`\``);
        }
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
              message: plan.message || "Commit from Jude",
              content: b64,
            });
            stepOutput = `Archivo subido a GitHub exitosamente: ${plan.path}`;
            await onProgress(`🚀 *Commit en GitHub:* \`${plan.path}\` en \`${plan.repo}\``);
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
        parts: [{ text: `RESULTADO DE LA ACCIÓN PREVIA:\n${stepOutput}\n\nDetermina el siguiente paso necesario para continuar el desarrollo o si el proyecto está completo ('finish').` }],
      });
    } catch (loopErr) {
      console.error("[DEV AGENT ERROR]", loopErr);
      await onProgress(`⚠️ *Incidencia en paso ${currentStep}:* ${loopErr.message}\nReintentando o adaptando...`);
      // Esperar brevemente antes de reintentar el paso
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!finalSummary) {
    finalSummary = `Se completaron ${currentStep} pasos en el proyecto. Todos los módulos y archivos generados se encuentran en el workspace del servidor.`;
  }

  return finalSummary;
}
