"use client";

import React, { useState } from "react";
import { Brain, X, Trash2, Plus, Sparkles } from "lucide-react";
import { USER_NAME, ASSISTANT_NAME } from "@/lib/constants";

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  memories: string[];
  onDeleteMemory: (index: number) => void;
  onAddMemory: (text: string) => void;
  onClearAll: () => void;
}

export const MemoryModal: React.FC<MemoryModalProps> = ({
  isOpen,
  onClose,
  memories,
  onDeleteMemory,
  onAddMemory,
  onClearAll,
}) => {
  const [newMemoryInput, setNewMemoryInput] = useState("");

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryInput.trim()) return;
    onAddMemory(newMemoryInput.trim());
    setNewMemoryInput("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-panel border border-core-amber/30 rounded-2xl p-6 shadow-hologram-lg text-neutral-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-core-amber/15 border border-core-amber/30 text-core-amber">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-white tracking-wide">
              Banco de Memoria Permanente
            </h3>
            <p className="text-xs font-mono text-core-amber/80">
              HECHOS RECORDADOS DE {USER_NAME.toUpperCase()} POR {ASSISTANT_NAME.toUpperCase()}
            </p>
          </div>
        </div>

        <p className="text-xs text-neutral-400 mb-4 font-body">
          {ASSISTANT_NAME} recuerda estos datos permanentemente en cada conversación (gustos, preferencias, proyectos e historia compartida).
        </p>

        {/* List of permanent memories */}
        <div className="max-h-60 overflow-y-auto space-y-2 pr-1 mb-4">
          {memories.length === 0 ? (
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-center text-xs font-mono text-neutral-500">
              No hay recuerdos almacenados aún. Cuéntale a Jude sobre ti (ej: tu comida favorita, metas o reglas) y los recordará para siempre.
            </div>
          ) : (
            memories.map((mem, index) => (
              <div
                key={index}
                className="flex items-start justify-between gap-3 p-3 rounded-xl bg-black/50 border border-core-amber/15 hover:border-core-amber/30 transition-all text-xs"
              >
                <div className="flex items-start gap-2 flex-1">
                  <Sparkles className="w-3.5 h-3.5 text-core-amber shrink-0 mt-0.5" />
                  <span className="text-neutral-200 font-body">{mem}</span>
                </div>
                <button
                  onClick={() => onDeleteMemory(index)}
                  className="text-neutral-500 hover:text-core-spark transition-colors p-1"
                  title="Olvidar este recuerdo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add manual memory input */}
        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newMemoryInput}
            onChange={(e) => setNewMemoryInput(e.target.value)}
            placeholder="Añadir recuerdo manualmente (ej: 'Trabaja en diseño')..."
            className="flex-1 bg-black/60 border border-core-amber/20 rounded-xl px-3 py-2 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-core-amber/50 font-body"
          />
          <button
            type="submit"
            className="px-3 py-2 rounded-xl bg-core-amber/15 hover:bg-core-amber/25 border border-core-amber/30 text-core-amber text-xs font-mono font-semibold flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Añadir
          </button>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/5 pt-3 text-[11px] font-mono">
          <span className="text-neutral-500">
            Total recuerdos: <strong className="text-white">{memories.length}</strong>
          </span>
          {memories.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-neutral-500 hover:text-core-spark transition-colors"
            >
              Borrar todos los recuerdos
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
