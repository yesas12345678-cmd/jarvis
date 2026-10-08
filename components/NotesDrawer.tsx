"use client";

import React, { useState } from "react";
import { THEMES, CoreTheme } from "@/lib/constants";
import { X, Check, Trash2, Plus, FileText } from "lucide-react";
import { soundEngine } from "@/lib/soundEngine";

interface NotesDrawerProps {
  isOpen: boolean;
  notes: string[];
  theme: CoreTheme;
  onClose: () => void;
  onAddNote: (text: string) => void;
  onDeleteNote: (index: number) => void;
  onClearNotes: () => void;
}

export const NotesDrawer: React.FC<NotesDrawerProps> = ({
  isOpen,
  notes,
  theme,
  onClose,
  onAddNote,
  onDeleteNote,
  onClearNotes,
}) => {
  const [newNoteInput, setNewNoteInput] = useState("");
  const activePalette = THEMES[theme] || THEMES.mark3;

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteInput.trim()) return;
    onAddNote(newNoteInput.trim());
    setNewNoteInput("");
    soundEngine.playActionConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-lg rounded-2xl border p-6 flex flex-col gap-5 shadow-2xl relative"
        style={{
          backgroundColor: "#0A0806",
          borderColor: activePalette.border,
          boxShadow: `0 0 30px ${activePalette.glow}`,
        }}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: `${activePalette.secondary}20` }}
            >
              <FileText className="w-5 h-5" style={{ color: activePalette.secondary }} />
            </div>
            <div>
              <h2
                className="text-base font-bold font-mono tracking-wider"
                style={{ color: activePalette.primary }}
              >
                REGISTRO DE NOTAS & TAREAS
              </h2>
              <p className="text-xs text-white/50">Memoria de trabajo persistente para Vaita</p>
            </div>
          </div>
          <button
            onClick={() => {
              soundEngine.playCancelChirp();
              onClose();
            }}
            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newNoteInput}
            onChange={(e) => setNewNoteInput(e.target.value)}
            placeholder="Nueva nota o pendiente..."
            className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none transition-all"
            style={{
              borderColor: newNoteInput ? activePalette.secondary : "rgba(255,255,255,0.1)",
            }}
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl font-mono text-xs font-bold text-black flex items-center gap-2 transition-all hover:brightness-110 active:scale-95"
            style={{ backgroundColor: activePalette.secondary }}
          >
            <Plus className="w-4 h-4" /> AGREGAR
          </button>
        </form>

        <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-1">
          {notes.length === 0 ? (
            <div className="text-center py-8 text-white/40 text-xs font-mono">
              NO HAY NOTAS ACTIVAS. DI "YUD, ANOTA QUE..." O AGREGA UNA MANUALMENTE.
            </div>
          ) : (
            notes.map((note, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all group"
              >
                <div className="flex items-center gap-3 text-sm text-white/90">
                  <span className="font-mono text-xs text-white/40">#{idx + 1}</span>
                  <span>{note}</span>
                </div>
                <button
                  onClick={() => {
                    onDeleteNote(idx);
                    soundEngine.playCancelChirp();
                  }}
                  className="opacity-60 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 text-white/50 transition-all"
                  title="Eliminar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {notes.length > 0 && (
          <div className="flex justify-between items-center pt-2 border-t border-white/10">
            <span className="text-[11px] font-mono text-white/40">
              Total notas activas: {notes.length}
            </span>
            <button
              onClick={() => {
                if (confirm("¿Borrar todas las notas de la lista?")) {
                  onClearNotes();
                  soundEngine.playCancelChirp();
                }
              }}
              className="text-xs font-mono text-red-400 hover:text-red-300 transition-colors"
            >
              Borrar todas
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
