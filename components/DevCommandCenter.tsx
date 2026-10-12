"use client";

import React, { useState, useEffect } from "react";
import {
  Code2,
  Folder,
  Terminal,
  Bot,
  ExternalLink,
  Play,
  GitBranch,
  Search,
  Sparkles,
  Send,
  CheckCircle2,
  AlertCircle,
  FileText,
  Layers,
  Cpu,
  RefreshCw,
  Plus,
  Trash2,
  ChevronRight,
  BookOpen,
  Sliders,
  Shield,
  Zap,
  LayoutGrid,
  List,
  Command,
} from "lucide-react";
import { soundEngine } from "@/lib/soundEngine";

interface ProjectItem {
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
  description?: string;
}

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

interface DivisionItem {
  id: string;
  label: string;
  icon: string;
  color: string;
  agentCount: number;
}

interface DevCommandCenterProps {
  onClose?: () => void;
  accentColor?: string;
}

export function DevCommandCenter({ onClose, accentColor = "#00d2ff" }: DevCommandCenterProps) {
  // Pestañas activas: 'projects' | 'agents' | 'missions' | 'terminal' | 'obsidian'
  const [activeTab, setActiveTab] = useState<"projects" | "agents" | "missions" | "terminal" | "obsidian">("projects");

  // Proyectos
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<ProjectItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [projectSearch, setProjectSearch] = useState<string>("");
  const [techFilter, setTechFilter] = useState<string>("ALL");
  const [loadingProjects, setLoadingProjects] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Agentes
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [divisions, setDivisions] = useState<DivisionItem[]>([]);
  const [filteredAgents, setFilteredAgents] = useState<AgentItem[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<string>("ALL");
  const [agentSearch, setAgentSearch] = useState<string>("");
  const [loadingAgents, setLoadingAgents] = useState<boolean>(true);
  const [selectedSquad, setSelectedSquad] = useState<AgentItem[]>([]);

  // Misiones
  const [missionPrompt, setMissionPrompt] = useState<string>("");
  const [missionStatus, setMissionStatus] = useState<"idle" | "dispatching" | "completed">("idle");
  const [lastDirective, setLastDirective] = useState<string | null>(null);

  // Terminal
  const [termCommand, setTermCommand] = useState<string>("");
  const [termOutput, setTermOutput] = useState<string>("Centro de Control Jarvis listo. Escribe un comando o selecciona una acción rápida.\n");
  const [termLoading, setTermLoading] = useState<boolean>(false);

  // Obsidian
  const [obsidianStatus, setObsidianStatus] = useState<{ installed: boolean; path: string } | null>(null);
  const [noteTitle, setNoteTitle] = useState<string>("");
  const [noteFeedback, setNoteFeedback] = useState<string>("");

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Cargar Proyectos
  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch("/api/dev/projects");
      const data = await res.json();
      if (data.projects) {
        setProjects(data.projects);
        setFilteredProjects(data.projects);
        if (!selectedProject && data.projects.length > 0) {
          setSelectedProject(data.projects[0]);
        }
      }
    } catch (err) {
      console.error("Error loading projects", err);
    } finally {
      setLoadingProjects(false);
    }
  };

  // Cargar Agentes
  const fetchAgents = async () => {
    setLoadingAgents(true);
    try {
      const res = await fetch("/api/dev/agents");
      const data = await res.json();
      if (data.agents) {
        setAgents(data.agents);
        setFilteredAgents(data.agents);
        setDivisions(data.divisions || []);
      }
    } catch (err) {
      console.error("Error loading agents", err);
    } finally {
      setLoadingAgents(false);
    }
  };

  // Cargar estado de Obsidian
  const fetchObsidian = async () => {
    try {
      const res = await fetch("/api/dev/obsidian");
      const data = await res.json();
      setObsidianStatus(data);
    } catch {}
  };

  useEffect(() => {
    fetchProjects();
    fetchAgents();
    fetchObsidian();
  }, []);

  // Filtrado de proyectos
  useEffect(() => {
    let result = [...projects];
    if (techFilter !== "ALL") {
      result = result.filter((p) => p.tech.toLowerCase().includes(techFilter.toLowerCase()));
    }
    if (projectSearch.trim()) {
      const q = projectSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.tech.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }
    setFilteredProjects(result);
  }, [projects, projectSearch, techFilter]);

  // Filtrado de agentes
  useEffect(() => {
    let result = [...agents];
    if (selectedDivision !== "ALL") {
      result = result.filter((a) => a.division === selectedDivision);
    }
    if (agentSearch.trim()) {
      const q = agentSearch.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.vibe.toLowerCase().includes(q)
      );
    }
    setFilteredAgents(result);
  }, [agents, selectedDivision, agentSearch]);

  // Acciones de Proyecto
  const handleProjectAction = async (action: string, projectName: string, scriptName?: string) => {
    try {
      soundEngine?.playBeep(440, 0.05);
      showToast(`Ejecutando ${action} en ${projectName}...`);
      const res = await fetch("/api/dev/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, projectName, scriptName }),
      });
      const data = await res.json();
      if (data.success) {
        soundEngine?.playActionConfirm();
        showToast(data.message || `Acción completada: ${action}`);
        if (data.output) {
          setTermOutput((prev) => `${prev}\n> [${projectName}] ${action} ${scriptName || ""}:\n${data.output}\n`);
        }
      } else {
        showToast(`Error: ${data.error}`);
      }
    } catch (err: any) {
      showToast(`Fallo: ${err.message}`);
    }
  };

  // Toggle Agente en Squad
  const toggleAgentInSquad = (agent: AgentItem) => {
    setSelectedSquad((prev) => {
      const exists = prev.some((a) => a.id === agent.id);
      if (exists) {
        return prev.filter((a) => a.id !== agent.id);
      } else {
        soundEngine?.playBeep(520, 0.08);
        return [...prev, agent];
      }
    });
  };

  // Desplegar Misión con Jude
  const handleDispatchMission = async () => {
    if (!missionPrompt.trim()) return;
    setMissionStatus("dispatching");
    soundEngine?.playActionConfirm();

    try {
      const res = await fetch("/api/dev/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: selectedProject?.name,
          selectedAgents: selectedSquad.map((a) => a.name),
          taskPrompt: missionPrompt,
          autoSquad: selectedSquad.length === 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLastDirective(data.directive);
        setMissionStatus("completed");
        soundEngine?.playActionConfirm();
        showToast("¡Directiva estratégica generada por Jude!");
      } else {
        setMissionStatus("idle");
        showToast(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setMissionStatus("idle");
      showToast(`Fallo de conexión: ${err.message}`);
    }
  };

  // Ejecutar comando en Terminal
  const handleExecuteCommand = async (customCmd?: string) => {
    const cmd = customCmd || termCommand;
    if (!cmd.trim()) return;

    setTermLoading(true);
    soundEngine?.playBeep(480, 0.04);
    const targetProj = selectedProject?.name || "";
    setTermOutput((prev) => `${prev}\n$ [${targetProj || "C:\\PROYECTOS"}] ${cmd}\n`);

    try {
      const res = await fetch("/api/dev/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: cmd,
          projectName: targetProj,
        }),
      });
      const data = await res.json();
      setTermOutput((prev) => `${prev}${data.stdout || ""}${data.stderr ? "\n[ERR] " + data.stderr : ""}\n`);
      if (!customCmd) setTermCommand("");
    } catch (err: any) {
      setTermOutput((prev) => `${prev}[ERROR DE CONEXIÓN] ${err.message}\n`);
    } finally {
      setTermLoading(false);
    }
  };

  // Acciones de Obsidian
  const handleObsidianAction = async (action: string) => {
    try {
      const res = await fetch("/api/dev/obsidian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          projectName: selectedProject?.name,
          noteTitle: noteTitle || `ARQUITECTURA_${selectedProject?.name || "SISTEMA"}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        soundEngine?.playActionConfirm();
        setNoteFeedback(data.message);
        showToast(data.message);
      }
    } catch (err: any) {
      showToast(err.message);
    }
  };

  return (
    <div className="w-full flex flex-col bg-neutral-950/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden transition-all duration-300">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-black/90 border border-cyan-500/40 text-cyan-300 px-4 py-2.5 rounded-xl shadow-xl font-mono text-xs flex items-center gap-2 backdrop-blur-md animate-fade-in">
          <Sparkles className="w-4 h-4 text-cyan-400 animate-spin" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Barra Superior del Centro de Control */}
      <div className="flex flex-wrap items-center justify-between px-6 py-4 border-b border-white/10 bg-black/60 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_12px_#00d2ff] animate-pulse" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold font-mono tracking-wider text-white uppercase flex items-center gap-1.5">
                <Code2 className="w-5 h-5 text-cyan-400" />
                CENTRO DE CONTROL WEB
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                PROYECTOS: {projects.length} | AGENTES: {agents.length}
              </span>
            </div>
            <p className="text-[11px] font-mono text-neutral-400">
              PANEL CENTRALIZADO DE DESARROLLO WEB // ORQUESTADOR JUDE & EJÉRCITO DE AGENTES
            </p>
          </div>
        </div>

        {/* Squad Activo Flotante */}
        {selectedSquad.length > 0 && (
          <div className="flex items-center gap-2 bg-neutral-900/90 border border-purple-500/30 px-3 py-1.5 rounded-xl">
            <span className="text-[11px] font-mono text-purple-300 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-purple-400" />
              SQUAD ACTIVO ({selectedSquad.length}):
            </span>
            <div className="flex -space-x-1.5 overflow-hidden">
              {selectedSquad.slice(0, 5).map((a) => (
                <span
                  key={a.id}
                  title={`${a.name} (${a.divisionLabel})`}
                  className="w-6 h-6 rounded-full bg-neutral-800 border border-white/20 flex items-center justify-center text-xs"
                >
                  {a.emoji}
                </span>
              ))}
            </div>
            <button
              onClick={() => setActiveTab("missions")}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/40 transition-colors"
            >
              Misión →
            </button>
            <button
              onClick={() => setSelectedSquad([])}
              title="Limpiar Squad"
              className="text-neutral-500 hover:text-red-400 text-xs ml-1"
            >
              ×
            </button>
          </div>
        )}

        {/* Pestañas de Navegación */}
        <div className="flex items-center gap-1.5 bg-neutral-900/80 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => setActiveTab("projects")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "projects"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Proyectos</span>
            <span className="text-[10px] opacity-60">({projects.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("agents")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "agents"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Ejército Agentes</span>
            <span className="text-[10px] opacity-60">({agents.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("missions")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "missions"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Misión Jude</span>
          </button>

          <button
            onClick={() => setActiveTab("terminal")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "terminal"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Terminal</span>
          </button>

          <button
            onClick={() => setActiveTab("obsidian")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "obsidian"
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/30 shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Obsidian</span>
          </button>
        </div>
      </div>

      {/* Contenido según Pestaña */}
      <div className="p-6">
        {/* ===================== TAB 1: PROYECTOS ===================== */}
        {activeTab === "projects" && (
          <div className="space-y-6">
            {/* Controles y Filtros de Proyectos */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    placeholder="Buscar proyectos por nombre, framework o descripción..."
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                {/* Filtro por Tecnología */}
                <select
                  value={techFilter}
                  onChange={(e) => setTechFilter(e.target.value)}
                  className="bg-neutral-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-neutral-300 focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="ALL">Todas las Tecnologías</option>
                  <option value="Next.js">Next.js</option>
                  <option value="React">React</option>
                  <option value="Vite">Vite</option>
                  <option value="Node">Node.js</option>
                  <option value="Python">Python</option>
                  <option value="HTML">HTML / Web</option>
                </select>
              </div>

              {/* Botones de Vista y Refrescar */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode(viewMode === "grid" ? "table" : "grid")}
                  className="p-2 rounded-xl bg-neutral-900 border border-white/10 text-neutral-400 hover:text-white transition-all text-xs font-mono flex items-center gap-1.5"
                  title="Cambiar vista"
                >
                  {viewMode === "grid" ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                </button>
                <button
                  onClick={fetchProjects}
                  className="p-2 rounded-xl bg-neutral-900 border border-white/10 text-neutral-400 hover:text-white transition-all text-xs font-mono flex items-center gap-1.5"
                  title="Recargar Proyectos"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingProjects ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Grid o Tabla de Proyectos */}
            {loadingProjects ? (
              <div className="py-20 text-center font-mono text-sm text-neutral-500 flex flex-col items-center gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                <span>Escaneando C:\PROYECTOS y ramas de Git...</span>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="py-16 text-center font-mono text-sm text-neutral-500">
                No se encontraron proyectos con ese criterio.
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProjects.map((p) => {
                  const isSelected = selectedProject?.id === p.id;
                  const hasScripts = Object.keys(p.packageScripts || {}).length > 0;

                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProject(p)}
                      className={`relative flex flex-col justify-between p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? "bg-neutral-900 border-cyan-500/60 shadow-[0_0_15px_rgba(0,210,255,0.15)]"
                          : "bg-neutral-950/60 border-white/10 hover:border-white/30 hover:bg-neutral-900/60"
                      }`}
                    >
                      {/* Cabecera de la Tarjeta */}
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{p.icon}</span>
                            <div>
                              <h3 className="text-sm font-bold font-mono text-white tracking-wide truncate max-w-[180px]">
                                {p.name}
                              </h3>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-cyan-300 border border-white/10">
                                {p.tech}
                              </span>
                            </div>
                          </div>

                          {/* Git Status Badge */}
                          {p.hasGit && (
                            <div className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-900 border border-white/10">
                              <GitBranch className="w-3 h-3 text-neutral-400" />
                              <span className="text-neutral-300">{p.gitBranch || "main"}</span>
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  p.gitStatus === "Limpio" ? "bg-emerald-400" : "bg-amber-400"
                                }`}
                              />
                            </div>
                          )}
                        </div>

                        {p.lastCommit && (
                          <p className="text-[11px] font-mono text-neutral-500 truncate mb-3" title={p.lastCommit}>
                            Último: {p.lastCommit}
                          </p>
                        )}
                      </div>

                      {/* Botones de Acción de la Tarjeta */}
                      <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2 mt-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProjectAction("open-vscode", p.name);
                            }}
                            title="Abrir en VS Code"
                            className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-mono transition-all flex items-center gap-1"
                          >
                            <Code2 className="w-3.5 h-3.5" />
                            <span className="text-[10px]">Code</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProjectAction("open-folder", p.name);
                            }}
                            title="Abrir Carpeta en Explorador"
                            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-white/10 text-xs font-mono transition-all"
                          >
                            <Folder className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProjectAction("open-terminal", p.name);
                            }}
                            title="Abrir Terminal en el Proyecto"
                            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-white/10 text-xs font-mono transition-all"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                          </button>

                          {hasScripts && p.packageScripts?.dev && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleProjectAction("run-script", p.name, "dev");
                              }}
                              title="Lanzar Servidor Dev (npm run dev)"
                              className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono transition-all flex items-center gap-1"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span className="text-[10px]">Dev</span>
                            </button>
                          )}
                        </div>

                        {/* Asignar Misión */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProject(p);
                            setActiveTab("missions");
                          }}
                          title="Asignar Misión de Agentes a este Proyecto"
                          className="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono transition-all flex items-center gap-1"
                        >
                          <Bot className="w-3.5 h-3.5" />
                          <span>Misión</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Vista en Tabla */
              <div className="overflow-x-auto border border-white/10 rounded-xl bg-neutral-950/60">
                <table className="w-full text-left font-mono text-xs text-neutral-300">
                  <thead className="bg-neutral-900 border-b border-white/10 text-neutral-400">
                    <tr>
                      <th className="p-3">Proyecto</th>
                      <th className="p-3">Tecnología</th>
                      <th className="p-3">Rama Git</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Último Commit</th>
                      <th className="p-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredProjects.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedProject(p)}
                        className={`hover:bg-neutral-900/60 cursor-pointer ${
                          selectedProject?.id === p.id ? "bg-cyan-500/10" : ""
                        }`}
                      >
                        <td className="p-3 font-bold text-white flex items-center gap-2">
                          <span>{p.icon}</span>
                          <span>{p.name}</span>
                        </td>
                        <td className="p-3 text-cyan-400">{p.tech}</td>
                        <td className="p-3">{p.gitBranch || "—"}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              p.gitStatus === "Limpio"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-amber-500/20 text-amber-300"
                            }`}
                          >
                            {p.gitStatus || "—"}
                          </span>
                        </td>
                        <td className="p-3 text-neutral-400 truncate max-w-xs">{p.lastCommit || "—"}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleProjectAction("open-vscode", p.name);
                              }}
                              className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px]"
                            >
                              Code
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleProjectAction("open-folder", p.name);
                              }}
                              className="px-2 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px]"
                            >
                              Carpeta
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 2: EJÉRCITO DE AGENTES ===================== */}
        {activeTab === "agents" && (
          <div className="space-y-6">
            {/* Divisiones Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <button
                onClick={() => setSelectedDivision("ALL")}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono whitespace-nowrap transition-all ${
                  selectedDivision === "ALL"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm"
                    : "bg-neutral-900 border border-white/10 text-neutral-400 hover:text-white"
                }`}
              >
                Todas las Divisiones ({agents.length})
              </button>
              {divisions.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDivision(d.id)}
                  style={{
                    borderColor: selectedDivision === d.id ? d.color : "rgba(255,255,255,0.1)",
                    color: selectedDivision === d.id ? d.color : "#aaa",
                    backgroundColor: selectedDivision === d.id ? `${d.color}20` : "rgba(20,20,20,0.8)",
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-mono border whitespace-nowrap transition-all flex items-center gap-1.5"
                >
                  <span>{d.label}</span>
                  <span className="text-[10px] opacity-75">({d.agentCount})</span>
                </button>
              ))}
            </div>

            {/* Buscador de Agentes */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Buscar especialistas: frontend, backend, test, qa, seo, devops, react, ux..."
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/50"
                />
              </div>
              <span className="text-xs font-mono text-neutral-400 whitespace-nowrap">
                {filteredAgents.length} agentes disponibles
              </span>
            </div>

            {/* Grid de Agentes */}
            {loadingAgents ? (
              <div className="py-20 text-center font-mono text-sm text-neutral-500 flex flex-col items-center gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
                <span>Cargando biblioteca de Agency Agents...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAgents.map((a) => {
                  const inSquad = selectedSquad.some((sq) => sq.id === a.id);
                  return (
                    <div
                      key={a.id}
                      className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                        inSquad
                          ? "bg-purple-950/40 border-purple-500/70 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                          : "bg-neutral-950/60 border-white/10 hover:border-white/30 hover:bg-neutral-900/60"
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{a.emoji}</span>
                            <div>
                              <h4 className="text-sm font-bold font-mono text-white tracking-wide">{a.name}</h4>
                              <span
                                style={{ color: a.color, borderColor: `${a.color}40`, backgroundColor: `${a.color}15` }}
                                className="text-[10px] font-mono px-2 py-0.5 rounded border inline-block mt-0.5"
                              >
                                {a.divisionLabel}
                              </span>
                            </div>
                          </div>

                          {/* Botón Añadir a Squad */}
                          <button
                            onClick={() => toggleAgentInSquad(a)}
                            className={`p-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1 ${
                              inSquad
                                ? "bg-purple-500 text-white font-bold"
                                : "bg-neutral-800 text-neutral-300 hover:bg-purple-500/20 hover:text-purple-300 border border-white/10"
                            }`}
                            title={inSquad ? "Quitar de Squad" : "Reclutar para Squad"}
                          >
                            {inSquad ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                            <span className="text-[10px]">{inSquad ? "En Squad" : "Reclutar"}</span>
                          </button>
                        </div>

                        <p className="text-xs font-mono text-neutral-400 line-clamp-2 mb-2">{a.description}</p>
                        <p className="text-[11px] font-mono text-neutral-500 italic mb-3">"{a.vibe}"</p>
                      </div>

                      {/* Asignar Misión Directa con este Agente */}
                      <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-neutral-500">Autónomo / Rol Markdown</span>
                        <button
                          onClick={() => {
                            if (!inSquad) setSelectedSquad([...selectedSquad, a]);
                            setActiveTab("missions");
                          }}
                          className="text-[10px] font-mono text-cyan-400 hover:underline flex items-center gap-1"
                        >
                          Asignar Tarea →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 3: MISIÓN JUDE ===================== */}
        {activeTab === "missions" && (
          <div className="space-y-6">
            <div className="bg-neutral-900/60 border border-white/10 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold font-mono text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    DESPACHADOR DE MISIONES ESTRATÉGICAS
                  </h3>
                  <p className="text-xs font-mono text-neutral-400">
                    Jude (Chief of Staff) orquesta la misión y coordina el escuadrón. Todo el desarrollo y programación técnica es ejecutado por <span className="text-cyan-400 font-bold">Antigravity</span>.
                  </p>
                </div>

                {/* Selector de Proyecto Destino */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-neutral-400">Proyecto Destino:</span>
                  <select
                    value={selectedProject?.name || ""}
                    onChange={(e) => {
                      const found = projects.find((p) => p.name === e.target.value);
                      if (found) setSelectedProject(found);
                    }}
                    className="bg-neutral-950 border border-white/20 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">(Global / Sin Proyecto Específico)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.icon} {p.name} ({p.tech})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Escuadrón Seleccionado */}
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-white/10">
                <span className="text-xs font-mono text-neutral-400">Escuadrón Asignado:</span>
                {selectedSquad.length === 0 ? (
                  <span className="text-xs font-mono text-neutral-500 italic">
                    Ninguno seleccionado (Jude armará el squad ideal automáticamente).
                  </span>
                ) : (
                  selectedSquad.map((a) => (
                    <span
                      key={a.id}
                      className="px-2.5 py-1 rounded-lg bg-neutral-950 border border-purple-500/40 text-purple-300 text-xs font-mono flex items-center gap-1.5"
                    >
                      <span>{a.emoji}</span>
                      <span>{a.name}</span>
                      <button
                        onClick={() => toggleAgentInSquad(a)}
                        className="text-neutral-500 hover:text-red-400 ml-1"
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
                <button
                  onClick={() => setActiveTab("agents")}
                  className="text-xs font-mono text-purple-400 hover:underline ml-2"
                >
                  + Modificar Escuadrón
                </button>
              </div>

              {/* Plantillas Rápidas de Tareas */}
              <div className="flex items-center gap-2 flex-wrap pt-2">
                <span className="text-[11px] font-mono text-neutral-500">Plantillas:</span>
                {[
                  "Auditoría completa de rendimiento y Core Web Vitals",
                  "Crear sistema de diseño y componentes UI modernos",
                  "Revisión de seguridad y optimización de base de datos",
                  "Estrategia de posicionamiento SEO y metatags",
                  "Automatización de tests y cobertura de pruebas",
                ].map((template) => (
                  <button
                    key={template}
                    onClick={() => setMissionPrompt(template)}
                    className="text-[10px] font-mono px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10 transition-colors"
                  >
                    {template}
                  </button>
                ))}
              </div>

              {/* Área de Entrada del Prompt de Misión */}
              <div className="relative">
                <textarea
                  rows={4}
                  placeholder="Describe la misión para el escuadrón (ej: 'Revisa el proyecto apppadel, detecta cuellos de botella en la renderización y crea un componente de marcador en tiempo real con Tailwind y animaciones fluidas')..."
                  value={missionPrompt}
                  onChange={(e) => setMissionPrompt(e.target.value)}
                  className="w-full bg-neutral-950 border border-white/20 rounded-xl p-4 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {/* Botón Desplegar */}
              <div className="flex justify-end">
                <button
                  onClick={handleDispatchMission}
                  disabled={missionStatus === "dispatching" || !missionPrompt.trim()}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold font-mono text-xs tracking-wider uppercase transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                >
                  {missionStatus === "dispatching" ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Jude Coordinando Escuadrón...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Desplegar Misión con Jude</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Directiva Generada por Jude */}
            {lastDirective && (
              <div className="bg-neutral-900/90 border border-emerald-500/40 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <h4 className="text-sm font-bold font-mono text-white tracking-wider uppercase">
                      DIRECTIVA ESTRATÉGICA EMITIDA POR JUDE
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ESTADO: LISTO PARA EJECUCIÓN
                  </span>
                </div>

                <div className="font-mono text-xs text-neutral-200 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto pr-2">
                  {lastDirective}
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(lastDirective);
                      showToast("Directiva copiada al portapapeles");
                    }}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono"
                  >
                    Copiar Directiva
                  </button>
                  <button
                    onClick={() => {
                      handleObsidianAction("create-project-note");
                    }}
                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-mono flex items-center gap-1.5"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Guardar en Obsidian</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 4: TERMINAL ===================== */}
        {activeTab === "terminal" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono text-white font-bold">
                  TERMINAL INTEGRADA // CONTEXTO: {selectedProject?.name || "C:\\PROYECTOS"}
                </span>
              </div>

              {/* Botones de Comandos Rápidos */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {["git status", "git pull", "git log -n 3", "npm test", "npm run build"].map((quickCmd) => (
                  <button
                    key={quickCmd}
                    onClick={() => handleExecuteCommand(quickCmd)}
                    className="text-[10px] font-mono px-2 py-1 rounded bg-neutral-900 border border-white/10 text-neutral-300 hover:border-amber-500/40 hover:text-amber-300 transition-colors"
                  >
                    {quickCmd}
                  </button>
                ))}
              </div>
            </div>

            {/* Consola de Salida */}
            <div className="bg-black border border-white/10 rounded-xl p-4 font-mono text-xs text-emerald-400 h-80 overflow-y-auto whitespace-pre-wrap select-text shadow-inner">
              {termOutput}
            </div>

            {/* Input de Comando */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExecuteCommand();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-500">$</span>
                <input
                  type="text"
                  placeholder="Escribe un comando para ejecutar en este proyecto (ej: npm run build, git push, code .)..."
                  value={termCommand}
                  onChange={(e) => setTermCommand(e.target.value)}
                  className="w-full bg-neutral-950 border border-white/20 rounded-xl pl-8 pr-4 py-2.5 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <button
                type="submit"
                disabled={termLoading}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold font-mono text-xs flex items-center gap-1.5"
              >
                {termLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>Ejecutar</span>
              </button>
            </form>
          </div>
        )}

        {/* ===================== TAB 5: OBSIDIAN ===================== */}
        {activeTab === "obsidian" && (
          <div className="space-y-6">
            <div className="bg-neutral-900/60 border border-violet-500/30 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold font-mono text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-violet-400" />
                    CONEXIÓN OBSIDIAN // SEGUNDO CEREBRO
                  </h3>
                  <p className="text-xs font-mono text-neutral-400">
                    Sincroniza y documenta la arquitectura técnica, bitácoras y tareas de tus 29 proyectos web.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40">
                    {obsidianStatus?.installed ? "INSTALADO EN PC" : "NO DETECTADO"}
                  </span>
                  <button
                    onClick={() => handleObsidianAction("launch")}
                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-mono text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Lanzar Obsidian</span>
                  </button>
                </div>
              </div>

              {/* Crear Bitácora de Proyecto */}
              <div className="pt-4 border-t border-white/10 space-y-3">
                <h4 className="text-xs font-mono text-neutral-300 font-bold">
                  Crear / Vincular Bitácora de Arquitectura para:{" "}
                  <span className="text-cyan-400">{selectedProject?.name || "Selecciona un proyecto"}</span>
                </h4>

                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Título de la nota (ej: ARQUITECTURA_Y_OBJETIVOS)..."
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    className="flex-1 bg-neutral-950 border border-white/20 rounded-xl px-4 py-2 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500"
                  />
                  <button
                    onClick={() => handleObsidianAction("create-project-note")}
                    className="px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-black font-bold font-mono text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Crear Nota Técnica</span>
                  </button>
                </div>

                {noteFeedback && (
                  <p className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {noteFeedback}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
