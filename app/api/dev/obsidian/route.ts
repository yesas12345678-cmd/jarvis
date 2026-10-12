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

    if (action === "launch") {
      exec(`start "" "${OBSIDIAN_EXE}"`);
      return NextResponse.json({ success: true, message: "Obsidian iniciado" });
    }

    if (action === "create-project-note") {
      // Si el proyecto tiene carpeta, creamos una nota de proyecto en su raíz o en obsidian
      const targetDir = projectName ? path.join("C:\\PROYECTOS", projectName) : "C:\\PROYECTOS";
      const noteFile = path.join(targetDir, `${noteTitle || "NOTAS_ARQUITECTURA"}.md`);
      
      const content = noteContent || `# 🚀 Bitácora de Proyecto: ${projectName}\n\nFecha: ${new Date().toLocaleDateString()}\n\n## 📋 Objetivos y Backlog\n- [ ] Revisión de arquitectura\n- [ ] Despliegue de agentes autónomos\n\n## 🤖 Agentes Asignados\n- Jude (Chief of Staff)\n\n## 📝 Notas Técnicas\n`;
      
      fs.writeFileSync(noteFile, content, "utf-8");
      
      // Intentar abrir con Obsidian o VS Code
      exec(`start "" "${OBSIDIAN_EXE}" || code "${noteFile}"`);

      return NextResponse.json({
        success: true,
        filePath: noteFile,
        message: `Nota creada y abierta: ${noteFile}`,
      });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error: any) {
    console.error("[DEV_OBSIDIAN_POST_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
