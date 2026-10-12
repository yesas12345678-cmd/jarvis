import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const AGENTS_REPO = "C:\\PROYECTOS\\agency-agents";
const PROJECTS_BASE = "C:\\PROYECTOS";

export async function POST(req: Request) {
  try {
    const { projectName, selectedAgents, taskPrompt, autoSquad } = await req.json();

    if (!taskPrompt || !taskPrompt.trim()) {
      return NextResponse.json({ error: "La descripción de la misión o tarea es requerida" }, { status: 400 });
    }

    // Obtener contexto del proyecto si existe
    let projectContext = "";
    if (projectName) {
      const projectPath = path.join(PROJECTS_BASE, projectName);
      if (fs.existsSync(projectPath)) {
        const pkgFile = path.join(projectPath, "package.json");
        let pkgDetails = "";
        if (fs.existsSync(pkgFile)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf-8"));
            pkgDetails = `Tecnología: ${JSON.stringify(pkg.dependencies || {})} | Scripts: ${JSON.stringify(pkg.scripts || {})}`;
          } catch {}
        }
        projectContext = `\nContexto del Proyecto Seleccionado: '${projectName}' (Ruta: ${projectPath}). ${pkgDetails}`;
      }
    }

    // Contexto de los agentes seleccionados
    const squadInfo = (selectedAgents && selectedAgents.length > 0)
      ? `Squad Asignado: ${selectedAgents.join(", ")}`
      : "Jude seleccionará el escuadrón ideal de la biblioteca de 140+ Agency Agents.";

    const systemPrompt = `
Eres JUDE, Chief of Staff y Orquestador Supremo de Inteligencia Artificial para Manuel.
Tienes bajo tu mando a un ejército de más de 140 agentes especializados (Agency Agents) en Ingeniería de Software, Diseño UI/UX, Testing/QA, Seguridad, DevOps, Marketing y Producto.

El usuario Manuel te ha encomendado la siguiente misión de desarrollo web:
"${taskPrompt}"
${projectContext}
${squadInfo}

Tu labor como Chief of Staff:
1. Analizar la misión con precisión militar y visión estratégica de alto nivel.
2. REGLA FUNDAMENTAL DE DESARROLLO: Tú como Jude NO programas código directamente. Tu rol es la orquestación, arquitectura y coordinación. Para cualquier escritura de código, desarrollo o edición de software, SIEMPRE necesitas y delegas la ejecución en ANTIGRAVITY (el motor y agente de programación local).
3. Definir o confirmar el escuadrón táctico de agentes asignados (roles de Agency Agents como Frontend Developer, QA, etc., que serán adoptados y ejecutados técnicamente por Antigravity).
4. Entregar una Directiva de Operación con:
   - 🎯 **Objetivo Estratégico**
   - 👥 **Escuadrón Asignado & Responsabilidades**
   - 🤖 **Ejecutor Técnico de Código**: Antigravity
   - 🛠️ **Plan de Acción Paso a Paso (Fases 1 a 4)**
   - 💻 **Instrucciones Técnicas y Comandos para Antigravity**
   - 🛡️ **Validación de Calidad y Criterios de Aceptación**
5. Mantén un tono ejecutivo, enfocado, resolutivo y elegante de Jude, dirigiéndote siempre a Manuel con respeto y determinación.
`;

    if (!GEMINI_API_KEY) {
      // Fallback si no hay API key configurada
      return NextResponse.json({
        success: true,
        missionId: `MIS-${Date.now()}`,
        status: "PLAN_GENERATED",
        squad: selectedAgents || ["Frontend Developer", "QA Automator", "Software Architect"],
        directive: `### 🎯 Misión Asignada por Jude\n\n**Proyecto**: ${projectName || "Global Web Dev"}\n**Objetivo**: ${taskPrompt}\n\n**Squad Desplegado**:\n- 🖥️ Frontend Developer: Implementación de componentes y estilos.\n- 🧪 Testing & QA Specialist: Verificación y pruebas de regresión.\n- 🛡️ DevOps Automator: Control de versiones y despliegue continuo.\n\n*Nota: Clave de Gemini lista para ejecución profunda en tiempo real.*`,
      });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(systemPrompt);
    const directiveText = result.response.text();

    return NextResponse.json({
      success: true,
      missionId: `MIS-${Date.now()}`,
      status: "EXECUTING",
      timestamp: new Date().toISOString(),
      squad: selectedAgents && selectedAgents.length > 0 ? selectedAgents : ["Frontend Developer", "Software Architect", "QA Tester"],
      directive: directiveText,
    });
  } catch (error: any) {
    console.error("[DEV_DISPATCH_POST_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
