import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const AGENTS_REPO = "C:\\PROYECTOS\\agency-agents";

interface AgentItem {
  id: string;
  name: string;
  description: string;
  division: string;
  divisionLabel: string;
  color: string;
  emoji: string;
  vibe: string;
  filePath: string;
}

interface DivisionInfo {
  id: string;
  label: string;
  icon: string;
  color: string;
  agentCount: number;
}

// Parser simple de frontmatter YAML
function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, body: content };

  const rawYaml = match[1];
  const body = match[2];
  const data: Record<string, string> = {};

  const lines = rawYaml.split(/\r?\n/);
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > -1) {
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      data[key] = val;
    }
  }

  return { data, body };
}

export async function GET() {
  try {
    if (!fs.existsSync(AGENTS_REPO)) {
      return NextResponse.json({ error: "Repositorio agency-agents no encontrado", agents: [] }, { status: 404 });
    }

    // Cargar divisions.json
    const divisionsPath = path.join(AGENTS_REPO, "divisions.json");
    let divisionsMeta: Record<string, { label: string; icon: string; color: string }> = {};
    if (fs.existsSync(divisionsPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(divisionsPath, "utf-8"));
        divisionsMeta = parsed.divisions || {};
      } catch {}
    }

    const agents: AgentItem[] = [];
    const divisionCounts: Record<string, number> = {};

    const dirs = fs.readdirSync(AGENTS_REPO, { withFileTypes: true });

    for (const dir of dirs) {
      if (!dir.isDirectory() || dir.name.startsWith(".") || ["integrations", "strategy", "examples", "scripts"].includes(dir.name)) {
        continue;
      }

      const divKey = dir.name;
      const divMeta = divisionsMeta[divKey] || {
        label: divKey.charAt(0).toUpperCase() + divKey.slice(1).replace(/-/g, " "),
        icon: "Bot",
        color: "#3B82F6",
      };

      const divDirPath = path.join(AGENTS_REPO, divKey);
      const files = fs.readdirSync(divDirPath);

      for (const file of files) {
        if (!file.endsWith(".md") || file.toLowerCase() === "readme.md") continue;

        const fullPath = path.join(divDirPath, file);
        const content = fs.readFileSync(fullPath, "utf-8");
        const { data } = parseFrontmatter(content);

        const agentName = data.name || file.replace(/\.md$/, "").replace(/^[a-z]+-/, "");
        const agentDesc = data.description || "Especialista autónomo listo para integrarse a tareas.";
        const agentEmoji = data.emoji || "🤖";
        const agentColor = data.color || divMeta.color;
        const agentVibe = data.vibe || "Enfocado en resultados y calidad de código.";

        agents.push({
          id: file.replace(/\.md$/, ""),
          name: agentName,
          description: agentDesc,
          division: divKey,
          divisionLabel: divMeta.label,
          color: agentColor,
          emoji: agentEmoji,
          vibe: agentVibe,
          filePath: fullPath,
        });

        divisionCounts[divKey] = (divisionCounts[divKey] || 0) + 1;
      }
    }

    // Lista estructurada de divisiones con contadores
    const divisionsList: DivisionInfo[] = Object.keys(divisionsMeta).map((key) => ({
      id: key,
      label: divisionsMeta[key].label,
      icon: divisionsMeta[key].icon,
      color: divisionsMeta[key].color,
      agentCount: divisionCounts[key] || 0,
    })).filter((d) => d.agentCount > 0);

    return NextResponse.json({
      total: agents.length,
      divisions: divisionsList,
      agents,
    });
  } catch (error: any) {
    console.error("[DEV_AGENTS_GET_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
