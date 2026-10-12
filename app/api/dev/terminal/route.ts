import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";

const PROJECTS_BASE = "C:\\PROYECTOS";

export async function POST(req: Request) {
  try {
    const { command, projectName } = await req.json();

    if (!command || typeof command !== "string") {
      return NextResponse.json({ error: "Comando no proporcionado" }, { status: 400 });
    }

    let cwd = PROJECTS_BASE;
    if (projectName) {
      const targetPath = path.join(PROJECTS_BASE, projectName);
      if (fs.existsSync(targetPath)) {
        cwd = targetPath;
      }
    }

    // Ejecutar con límite de tiempo de 30 segundos
    return new Promise<NextResponse>((resolve) => {
      exec(
        command,
        {
          cwd,
          timeout: 30000,
          maxBuffer: 1024 * 1024 * 5, // 5MB buffer
          shell: "powershell.exe",
        },
        (error, stdout, stderr) => {
          resolve(
            NextResponse.json({
              success: !error,
              command,
              cwd,
              stdout: stdout || "",
              stderr: stderr || (error ? error.message : ""),
              exitCode: error ? error.code || 1 : 0,
            })
          );
        }
      );
    });
  } catch (error: any) {
    console.error("[DEV_TERMINAL_POST_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
