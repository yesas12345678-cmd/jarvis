import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);
const PROJECTS_BASE = "C:\\PROYECTOS";

interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  tech: string;
  icon: string;
  hasGit: boolean;
  gitBranch?: string;
  gitStatus?: string;
  lastCommit?: string;
  packageScripts?: Record<string, string>;
  dependencies?: string[];
  description?: string;
  hasObsidianNote?: boolean;
}

// Helper para detectar la tecnología
function detectTech(projectPath: string): { tech: string; icon: string; scripts: Record<string, string>; desc: string } {
  const pkgPath = path.join(projectPath, "package.json");
  let scripts: Record<string, string> = {};
  let desc = "";

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      scripts = pkg.scripts || {};
      desc = pkg.description || "";
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      if (deps["next"]) return { tech: "Next.js", icon: "▲", scripts, desc };
      if (deps["@astrojs/starlight"] || deps["astro"]) return { tech: "Astro", icon: "🚀", scripts, desc };
      if (deps["vite"]) return { tech: "Vite", icon: "⚡", scripts, desc };
      if (deps["react-native"] || deps["expo"]) return { tech: "Expo / React Native", icon: "📱", scripts, desc };
      if (deps["react"]) return { tech: "React", icon: "⚛️", scripts, desc };
      if (deps["vue"]) return { tech: "Vue", icon: "🟢", scripts, desc };
      if (deps["express"] || deps["fastify"]) return { tech: "Node.js Backend", icon: "🟩", scripts, desc };
      return { tech: "Node.js", icon: "📦", scripts, desc };
    } catch {
      // Ignorar error de parsing
    }
  }

  // Verificar Python
  if (fs.existsSync(path.join(projectPath, "requirements.txt")) || fs.existsSync(path.join(projectPath, "main.py"))) {
    return { tech: "Python", icon: "🐍", scripts, desc: "Aplicación Python" };
  }

  // Verificar HTML estático
  if (fs.existsSync(path.join(projectPath, "index.html"))) {
    return { tech: "HTML / Web", icon: "🌐", scripts, desc: "Sitio Web Estático" };
  }

  return { tech: "Directorio", icon: "📁", scripts, desc: "Proyecto general" };
}

// Obtener info de Git
async function getGitInfo(projectPath: string): Promise<{ branch?: string; status?: string; lastCommit?: string }> {
  const gitDir = path.join(projectPath, ".git");
  if (!fs.existsSync(gitDir)) return {};

  try {
    const { stdout: branch } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd: projectPath, timeout: 3000 });
    const { stdout: status } = await execAsync("git status --porcelain", { cwd: projectPath, timeout: 3000 });
    const { stdout: commit } = await execAsync('git log -1 --pretty=format:"%s (%cr)"', { cwd: projectPath, timeout: 3000 });

    const hasChanges = status.trim().length > 0;
    return {
      branch: branch.trim(),
      status: hasChanges ? "Modificado" : "Limpio",
      lastCommit: commit.trim(),
    };
  } catch {
    return { branch: "main", status: "Desconocido" };
  }
}

export async function GET() {
  try {
    if (!fs.existsSync(PROJECTS_BASE)) {
      return NextResponse.json({ error: "Directorio C:\\PROYECTOS no encontrado", projects: [] }, { status: 404 });
    }

    const items = fs.readdirSync(PROJECTS_BASE, { withFileTypes: true });
    const projectDirs = items.filter((item) => item.isDirectory() && !item.name.startsWith("."));

    const projects: ProjectInfo[] = await Promise.all(
      projectDirs.map(async (dir) => {
        const fullPath = path.join(PROJECTS_BASE, dir.name);
        const { tech, icon, scripts, desc } = detectTech(fullPath);
        const gitInfo = await getGitInfo(fullPath);

        return {
          id: dir.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
          name: dir.name,
          path: fullPath,
          tech,
          icon,
          hasGit: fs.existsSync(path.join(fullPath, ".git")),
          gitBranch: gitInfo.branch,
          gitStatus: gitInfo.status,
          lastCommit: gitInfo.lastCommit,
          packageScripts: scripts,
          description: desc,
        };
      })
    );

    // Ordenar alfabéticamente
    projects.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      basePath: PROJECTS_BASE,
      total: projects.length,
      projects,
    });
  } catch (error: any) {
    console.error("[DEV_PROJECTS_GET_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { action, projectName, scriptName } = await req.json();

    if (!projectName) {
      return NextResponse.json({ error: "Nombre del proyecto requerido" }, { status: 400 });
    }

    const projectPath = path.join(PROJECTS_BASE, projectName);
    if (!fs.existsSync(projectPath)) {
      return NextResponse.json({ error: `Proyecto no encontrado en ${projectPath}` }, { status: 404 });
    }

    if (action === "open-vscode") {
      await execAsync(`code "${projectPath}"`);
      return NextResponse.json({ success: true, message: `Abierto en VS Code: ${projectName}` });
    }

    if (action === "open-folder") {
      await execAsync(`explorer "${projectPath}"`);
      return NextResponse.json({ success: true, message: `Carpeta abierta: ${projectName}` });
    }

    if (action === "open-terminal") {
      // Abre Windows Terminal o Powershell en la carpeta del proyecto
      exec(`start wt.exe -d "${projectPath}" || start powershell -NoExit -Command "Set-Location '${projectPath}'"`);
      return NextResponse.json({ success: true, message: `Terminal abierta en ${projectName}` });
    }

    if (action === "run-script") {
      if (!scriptName) {
        return NextResponse.json({ error: "Nombre de script requerido" }, { status: 400 });
      }

      // Si es un script dev largo, se ejecuta en una nueva ventana de terminal
      if (scriptName === "dev" || scriptName === "start") {
        exec(`start cmd /k "cd /d "${projectPath}" && npm run ${scriptName}""`);
        return NextResponse.json({ success: true, message: `Iniciado 'npm run ${scriptName}' en ventana dedicada` });
      }

      // Otros scripts (build, test, lint) se ejecutan y devuelven la salida
      const { stdout, stderr } = await execAsync(`npm run ${scriptName}`, { cwd: projectPath, timeout: 60000 });
      return NextResponse.json({ success: true, output: stdout || stderr });
    }

    if (action === "git-status") {
      const { stdout } = await execAsync("git status", { cwd: projectPath, timeout: 5000 });
      return NextResponse.json({ success: true, output: stdout });
    }

    return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
  } catch (error: any) {
    console.error("[DEV_PROJECTS_POST_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
