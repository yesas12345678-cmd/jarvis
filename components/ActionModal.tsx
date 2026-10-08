"use client";

import React, { useState } from "react";
import { ActionPayload, USER_NAME, ASSISTANT_NAME } from "@/lib/constants";
import { Mail, Calendar, CheckCircle2, X, ExternalLink, Zap } from "lucide-react";

interface ActionModalProps {
  action: ActionPayload | null;
  onClose: () => void;
}

export const ActionModal: React.FC<ActionModalProps> = ({ action, onClose }) => {
  const [isExecutingAdvanced, setIsExecutingAdvanced] = useState(false);
  const [executionResult, setExecutionResult] = useState<string | null>(null);

  if (!action || action.type === "none") return null;

  const handleSimpleConfirm = () => {
    if (action.type === "email") {
      const recipient = action.recipient || "";
      const subject = action.subject || "Mensaje de " + USER_NAME;
      const body = action.body || "";
      const mailto = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(mailto, "_blank");
    } else if (action.type === "calendar") {
      const title = action.title || "Evento con " + USER_NAME;
      const date = action.date || "20261015T160000Z/20261015T170000Z";
      const details = action.details || `Coordinado por ${ASSISTANT_NAME} para ${USER_NAME}`;
      const location = action.location || "Virtual";
      const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${date}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
      window.open(calUrl, "_blank");
    }
    onClose();
  };

  const handleAdvancedExecute = async () => {
    setIsExecutingAdvanced(true);
    try {
      const res = await fetch("/api/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: action.type, payload: action }),
      });
      const data = await res.json();
      if (data.configured) {
        setExecutionResult("Ejecutado en segundo plano con éxito mediante API directa.");
        setTimeout(() => onClose(), 2000);
      } else {
        // Fallback asistido a confirmación directa
        setExecutionResult("OAuth no vinculado en .env.local. Abriendo ventana de confirmación rápida...");
        setTimeout(() => {
          handleSimpleConfirm();
        }, 1200);
      }
    } catch {
      handleSimpleConfirm();
    } finally {
      setIsExecutingAdvanced(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-panel border border-core-amber/30 rounded-xl p-6 shadow-hologram-lg text-neutral-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-core-amber/10 border border-core-amber/20 text-core-amber">
            {action.type === "email" ? (
              <Mail className="w-6 h-6" />
            ) : (
              <Calendar className="w-6 h-6" />
            )}
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-white tracking-wide">
              {action.type === "email" ? "Preparar Correo" : "Agendar en Calendario"}
            </h3>
            <p className="text-xs font-mono text-core-amber/80">
              ACCION ASISTIDA // {USER_NAME}
            </p>
          </div>
        </div>

        {/* Content Preview */}
        <div className="bg-black/60 border border-white/5 rounded-lg p-3 text-xs font-mono space-y-2 mb-5">
          {action.type === "email" ? (
            <>
              <div>
                <span className="text-neutral-500 uppercase">Para:</span>{" "}
                <span className="text-white">{action.recipient || "contacto@ejemplo.com"}</span>
              </div>
              <div>
                <span className="text-neutral-500 uppercase">Asunto:</span>{" "}
                <span className="text-core-light">{action.subject || "Sin asunto"}</span>
              </div>
              <div className="pt-1 border-t border-white/5 text-neutral-300 font-body">
                {action.body || "Mensaje preparado."}
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-neutral-500 uppercase">Título:</span>{" "}
                <span className="text-white">{action.title || "Evento"}</span>
              </div>
              <div>
                <span className="text-neutral-500 uppercase">Detalle:</span>{" "}
                <span className="text-neutral-300 font-body">{action.details || "Reunión"}</span>
              </div>
              <div>
                <span className="text-neutral-500 uppercase">Ubicación:</span>{" "}
                <span className="text-core-light">{action.location || "Virtual"}</span>
              </div>
            </>
          )}
        </div>

        {executionResult && (
          <div className="mb-4 text-xs font-mono text-core-amber bg-core-amber/10 border border-core-amber/30 rounded p-2">
            {executionResult}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSimpleConfirm}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-core-amber hover:bg-core-amber/90 text-black font-semibold text-xs tracking-wider transition-all duration-200 shadow-hologram"
          >
            <ExternalLink className="w-4 h-4" />
            CONFIRMAR EN 1 CLIC
          </button>

          <button
            onClick={handleAdvancedExecute}
            disabled={isExecutingAdvanced}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg border border-core-orange/40 hover:bg-core-orange/10 text-core-orange font-mono text-xs tracking-wider transition-all duration-200"
            title="Ejecución directa en segundo plano (Modo Avanzado)"
          >
            <Zap className="w-3.5 h-3.5" />
            SEGUNDO PLANO
          </button>
        </div>
      </div>
    </div>
  );
};
