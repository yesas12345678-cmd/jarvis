import { NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

const OBSIDIAN_EXE = "C:\\Users\\yesas\\AppData\\Local\\Programs\\obsidian\\Obsidian.exe";

export async function GET() {
  const isInstalled = fs.existsSync(OBSIDIAN_EXE);
  return NextResponse.json({
    installed: isInstalled,
    path: OBSIDIAN_EXE,
  });
}

export async function POST(req: Request) {
  try {
    const { action, projectName, noteTitle, noteContent } = await req.json();

    const VAULT_DIR = "C:\\PROYECTOS\\Segundo Cerebro";

    if (action === "launch") {
      // Abrir la bóveda directamente usando el protocolo de Obsidian
      exec(`start "" "obsidian://open?vault=Segundo%20Cerebro" || start "" "${OBSIDIAN_EXE}"`);
      return NextResponse.json({ success: true, message: "Obsidian iniciado en Segundo Cerebro" });
    }

    if (action === "create-project-note") {
      const projectsVaultDir = path.join(VAULT_DIR, "01 - Proyectos");
      if (!fs.existsSync(projectsVaultDir)) {
        fs.mkdirSync(projectsVaultDir, { recursive: true });
      }

      const safeName = projectName || "Nuevo-Proyecto";
      const noteFile = path.join(projectsVaultDir, `${safeName}.md`);
      
      if (!fs.existsSync(noteFile)) {
        const content = noteContent || `# 🚀 Bitácora de Proyecto: ${safeName}\n\nFecha: ${new Date().toLocaleDateString()}\n\n## 📋 Objetivos y Backlog\n- [ ] Revisión de arquitectura\n- [ ] Asignación de escuadrones de agentes\n\n## 🤖 Agentes Asignados\n- [[02 - Agentes & IA/Jude - Chief of Staff|Jude]]\n- [[02 - Agentes & IA/Antigravity - Ingeniero Senior|Antigravity]]\n\n## 📝 Notas Técnicas\n`;
        fs.writeFileSync(noteFile, content, "utf-8");
      }

      // Abrir la nota directamente en Obsidian mediante URI
      const encodedFile = encodeURIComponent(safeName);
      exec(`start "" "obsidian://open?vault=Segundo%20Cerebro&file=01%20-%20Proyectos%2F${encodedFile}"`);

      return NextResponse.json({
        success: true,
        filePath: noteFile,
        message: `Nota sincronizada en Segundo Cerebro: ${safeName}.md`,
      });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error: any) {
    console.error("[DEV_OBSIDIAN_POST_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
