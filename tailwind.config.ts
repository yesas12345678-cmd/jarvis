import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#030303",
        panel: "#0A0806",
        "panel-border": "rgba(255, 176, 32, 0.15)",
        core: {
          light: "#FFF6E0",
          amber: "#FFB020",
          orange: "#FF7A1A",
          spark: "#FF3D1F",
          ghost: "#2E5A88",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "Sora", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
        body: ["Inter", "sans-serif"],
      },
      boxShadow: {
        hologram: "0 0 50px -10px rgba(255, 176, 32, 0.35)",
        "hologram-lg": "0 0 100px -20px rgba(255, 122, 26, 0.45)",
        "core-glow": "0 0 25px 2px rgba(255, 246, 224, 0.8)",
      },
      animation: {
        "spin-slow": "spin 24s linear infinite",
        "spin-reverse-slow": "spin-reverse 20s linear infinite",
        pulse_subtle: "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        "spin-reverse": {
          from: { transform: "rotate(360deg)" },
          to: { transform: "rotate(0deg)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
