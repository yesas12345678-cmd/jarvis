"use client";

import React, { useEffect, useRef } from "react";
import { AssistantState, THEME_COLORS } from "@/lib/constants";

interface HolographicCoreProps {
  state: AssistantState;
  audioLevel?: number; // 0 a 1
  onClick?: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
  angle: number;
  distance: number;
  speed: number;
}

export const HolographicCore: React.FC<HolographicCoreProps> = ({
  state,
  audioLevel = 0,
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    // Partículas
    const particleCount = 220;
    const particles: Particle[] = [];
    const colors = [
      THEME_COLORS.core,
      THEME_COLORS.amber,
      THEME_COLORS.orange,
      THEME_COLORS.spark,
    ];

    for (let i = 0; i < particleCount; i++) {
      const dist = 30 + Math.random() * 150;
      const angle = Math.random() * Math.PI * 2;
      particles.push({
        x: 0,
        y: 0,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2 + 0.8,
        alpha: Math.random() * 0.8 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        angle,
        distance: dist,
        speed: (Math.random() * 0.015 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
      });
    }

    let time = 0;

    const render = () => {
      time += 0.016;
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = Math.min(width, height) * 0.22;

      // Parámetros según la máquina de estados
      let spinSpeed = 1.0;
      let coreBreath = Math.sin(time * 2) * 4;
      let energyBoost = 0;
      let particleCompression = 1.0;

      if (state === "idle") {
        spinSpeed = 0.6;
        coreBreath = Math.sin(time * 1.5) * 5;
      } else if (state === "listening") {
        spinSpeed = 1.8;
        energyBoost = audioLevel * 25;
        coreBreath = Math.sin(time * 5) * 8 + energyBoost;
      } else if (state === "processing") {
        spinSpeed = -3.2; // Giro rápido en contrasentido
        coreBreath = Math.sin(time * 12) * 10;
        particleCompression = 0.65; // Partículas se comprimen hacia el centro
      } else if (state === "speaking") {
        spinSpeed = 1.4;
        energyBoost = (audioLevel || 0.4) * 35;
        coreBreath = Math.sin(time * 8) * 12 + energyBoost;
      }

      ctx.save();
      // Efecto holográfico óptico
      ctx.globalCompositeOperation = "lighter";

      // 1. Halo fantasma de fondo azul (10-15% opacidad)
      const ghostGradient = ctx.createRadialGradient(
        cx,
        cy,
        baseRadius * 0.2,
        cx,
        cy,
        baseRadius * 2.2
      );
      ghostGradient.addColorStop(0, "rgba(46, 90, 136, 0.22)");
      ghostGradient.addColorStop(0.5, "rgba(46, 90, 136, 0.08)");
      ghostGradient.addColorStop(1, "rgba(46, 90, 136, 0)");
      ctx.fillStyle = ghostGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // 2. Rayos tenues irradiando desde el centro hacia afuera
      const rayCount = 18;
      ctx.lineWidth = 1;
      for (let i = 0; i < rayCount; i++) {
        const rayAngle = (i * (Math.PI * 2)) / rayCount + time * 0.2 * spinSpeed;
        const rLen = baseRadius * 1.6 + Math.sin(time * 3 + i) * 12 + energyBoost;
        const x2 = cx + Math.cos(rayAngle) * rLen;
        const y2 = cy + Math.sin(rayAngle) * rLen;

        const rayGrad = ctx.createLinearGradient(cx, cy, x2, y2);
        rayGrad.addColorStop(0, "rgba(255, 246, 224, 0.4)");
        rayGrad.addColorStop(0.5, "rgba(255, 176, 32, 0.2)");
        rayGrad.addColorStop(1, "rgba(255, 122, 26, 0)");

        ctx.strokeStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // 3. Anillos concéntricos holográficos
      const rings = [
        { r: baseRadius * 0.7, dash: [4, 6], speed: 1.0, color: THEME_COLORS.amber },
        { r: baseRadius * 1.0, dash: [14, 8, 2, 8], speed: -0.7, color: THEME_COLORS.orange },
        { r: baseRadius * 1.35, dash: [24, 12, 6, 12], speed: 0.5, color: THEME_COLORS.amber },
        { r: baseRadius * 1.65, dash: [2, 10], speed: -1.2, color: THEME_COLORS.spark },
      ];

      rings.forEach((ring, index) => {
        const ringRadius = ring.r + coreBreath * 0.3;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(time * ring.speed * spinSpeed);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(ringRadius, 10), 0, Math.PI * 2);
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = index === 1 ? 2 : 1.2;
        ctx.setLineDash(ring.dash);
        ctx.stroke();

        // Pequeños nodos en los anillos
        const nodeAngle = time * (index % 2 === 0 ? 1 : -1) * 2;
        const nx = Math.cos(nodeAngle) * ringRadius;
        const ny = Math.sin(nodeAngle) * ringRadius;
        ctx.fillStyle = THEME_COLORS.core;
        ctx.beginPath();
        ctx.arc(nx, ny, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // 4. Campo de partículas a la deriva / orbitales
      particles.forEach((p) => {
        p.angle += p.speed * spinSpeed;
        const currentDist = p.distance * particleCompression + coreBreath * 0.5;
        p.x = cx + Math.cos(p.angle) * currentDist + Math.sin(time + p.distance) * 5;
        p.y = cy + Math.sin(p.angle) * currentDist + Math.cos(time + p.distance) * 5;

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * (state === "listening" ? 1 : 0.85);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + (energyBoost > 5 ? 1 : 0), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // 5. Núcleo central incandescente blanco-dorado
      const coreR = Math.max(baseRadius * 0.38 + coreBreath, 12);
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.8);
      coreGrad.addColorStop(0, "#FFFFFF");
      coreGrad.addColorStop(0.25, THEME_COLORS.core);
      coreGrad.addColorStop(0.65, THEME_COLORS.amber);
      coreGrad.addColorStop(0.85, THEME_COLORS.orange);
      coreGrad.addColorStop(1, "rgba(255, 61, 31, 0)");

      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Esfera sólida central
      ctx.fillStyle = "#FFFDF5";
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 0.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [state, audioLevel]);

  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-center w-full max-w-[540px] aspect-square mx-auto cursor-pointer select-none group"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="absolute inset-0 rounded-full pointer-events-none group-hover:ring-1 group-hover:ring-core-amber/30 transition-all duration-500" />
    </div>
  );
};
