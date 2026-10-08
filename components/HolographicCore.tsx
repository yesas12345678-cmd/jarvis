"use client";

import React, { useEffect, useRef } from "react";
import { AssistantState, CoreTheme, THEMES } from "@/lib/constants";

interface HolographicCoreProps {
  state: AssistantState;
  theme?: CoreTheme;
  audioLevel?: number; // 0 a 1
  onClick?: () => void;
}

interface Particle {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: string;
  angle: number;
  distance: number;
  speed: number;
}

export const HolographicCore: React.FC<HolographicCoreProps> = ({
  state,
  theme = "mark3",
  audioLevel = 0,
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePalette = THEMES[theme] || THEMES.mark3;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 500);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 500);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener("resize", handleResize);

    const currentColors = [
      activePalette.primary,
      activePalette.secondary,
      activePalette.accent,
      activePalette.spark,
    ];

    // Partículas orbitales y de polvo cuántico
    const particleCount = 240;
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      const dist = 25 + Math.random() * 160;
      const angle = Math.random() * Math.PI * 2;
      particles.push({
        x: 0,
        y: 0,
        radius: Math.random() * 2.2 + 0.7,
        alpha: Math.random() * 0.8 + 0.25,
        color: currentColors[Math.floor(Math.random() * currentColors.length)],
        angle,
        distance: dist,
        speed: (Math.random() * 0.018 + 0.006) * (Math.random() > 0.5 ? 1 : -1),
      });
    }

    let time = 0;

    const render = () => {
      time += 0.016;
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = Math.min(width, height) * 0.22;

      // Parámetros reactivos por estado
      let spinSpeed = 1.0;
      let coreBreath = Math.sin(time * 2) * 4;
      let energyBoost = 0;
      let particleCompression = 1.0;

      if (state === "idle") {
        spinSpeed = 0.6;
        coreBreath = Math.sin(time * 1.5) * 5;
      } else if (state === "listening") {
        spinSpeed = 1.9;
        energyBoost = (audioLevel || 0.1) * 30;
        coreBreath = Math.sin(time * 6) * 9 + energyBoost;
      } else if (state === "processing") {
        spinSpeed = -3.5; // Giro acelerado cuántico
        coreBreath = Math.sin(time * 14) * 12;
        particleCompression = 0.6; // Partículas succionadas al centro
      } else if (state === "speaking") {
        spinSpeed = 1.5;
        energyBoost = (audioLevel || 0.45) * 40;
        coreBreath = Math.sin(time * 9) * 14 + energyBoost;
      }

      ctx.save();
      // Efecto aditivo holográfico óptico
      ctx.globalCompositeOperation = "lighter";

      // 1. Halo difuso exterior reactivo
      const ghostGradient = ctx.createRadialGradient(
        cx,
        cy,
        baseRadius * 0.2,
        cx,
        cy,
        baseRadius * 2.3 + energyBoost * 0.5
      );
      ghostGradient.addColorStop(0, activePalette.ghost);
      ghostGradient.addColorStop(0.5, activePalette.ghost.replace("0.22", "0.08"));
      ghostGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = ghostGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 2.3 + energyBoost * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // 2. Rayos y filamentos de energía irradiando desde el centro
      const rayCount = 20;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < rayCount; i++) {
        const rayAngle = (i * (Math.PI * 2)) / rayCount + time * 0.25 * spinSpeed;
        const rLen = baseRadius * 1.65 + Math.sin(time * 3 + i) * 14 + energyBoost * 0.8;
        const x2 = cx + Math.cos(rayAngle) * rLen;
        const y2 = cy + Math.sin(rayAngle) * rLen;

        const rayGrad = ctx.createLinearGradient(cx, cy, x2, y2);
        rayGrad.addColorStop(0, activePalette.primary);
        rayGrad.addColorStop(0.4, activePalette.secondary);
        rayGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.strokeStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // 3. Anillos concéntricos holográficos giratorios
      const rings = [
        { r: baseRadius * 0.72, dash: [4, 6], speed: 1.1, color: activePalette.secondary, width: 1.2 },
        { r: baseRadius * 1.05, dash: [16, 8, 2, 8], speed: -0.75, color: activePalette.accent, width: 2.0 },
        { r: baseRadius * 1.38, dash: [26, 14, 6, 14], speed: 0.55, color: activePalette.secondary, width: 1.4 },
        { r: baseRadius * 1.72, dash: [3, 12], speed: -1.3, color: activePalette.spark, width: 1.0 },
      ];

      rings.forEach((ring, index) => {
        const ringRadius = ring.r + coreBreath * 0.35;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(time * ring.speed * spinSpeed);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(ringRadius, 10), 0, Math.PI * 2);
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = ring.width;
        ctx.setLineDash(ring.dash);
        ctx.stroke();

        // Nodos orbitales con micro-resplandor
        const nodeAngle = time * (index % 2 === 0 ? 1.5 : -1.5);
        const nx = Math.cos(nodeAngle) * ringRadius;
        const ny = Math.sin(nodeAngle) * ringRadius;
        ctx.fillStyle = activePalette.primary;
        ctx.beginPath();
        ctx.arc(nx, ny, 2.8, 0, Math.PI * 2);
        ctx.fill();

        // Marcadores de mira a 90 grados en el anillo principal
        if (index === 1) {
          for (let m = 0; m < 4; m++) {
            const mAngle = (m * Math.PI) / 2;
            const mx = Math.cos(mAngle) * ringRadius;
            const my = Math.sin(mAngle) * ringRadius;
            ctx.fillStyle = activePalette.secondary;
            ctx.fillRect(mx - 2, my - 2, 4, 4);
          }
        }

        ctx.restore();
      });

      // 4. Campo de partículas orbitales
      particles.forEach((p) => {
        p.angle += p.speed * spinSpeed;
        const currentDist = p.distance * particleCompression + coreBreath * 0.45;
        p.x = cx + Math.cos(p.angle) * currentDist + Math.sin(time + p.distance) * 4;
        p.y = cy + Math.sin(p.angle) * currentDist + Math.cos(time + p.distance) * 4;

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * (state === "listening" ? 1 : 0.85);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + (energyBoost > 6 ? 1.2 : 0), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // 5. Núcleo estelar incandescente
      const coreR = Math.max(baseRadius * 0.4 + coreBreath, 12);
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.85);
      coreGrad.addColorStop(0, "#FFFFFF");
      coreGrad.addColorStop(0.2, activePalette.primary);
      coreGrad.addColorStop(0.55, activePalette.secondary);
      coreGrad.addColorStop(0.85, activePalette.accent);
      coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 1.85, 0, Math.PI * 2);
      ctx.fill();

      // Esfera estelar blanca sólida en el centro
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 0.52, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [state, theme, audioLevel, activePalette]);

  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-center w-full max-w-[540px] aspect-square mx-auto cursor-pointer select-none group"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div
        className="absolute inset-0 rounded-full pointer-events-none transition-all duration-500 group-hover:scale-105"
        style={{
          boxShadow: `0 0 35px ${activePalette.glow}`,
        }}
      />
    </div>
  );
};
