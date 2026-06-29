import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Royal 1 brand palette — modern gaming (dark).
        royal: {
          blue: "#3b82f6",
          "blue-bright": "#60a5fa",
          red: "#f43f5e",
          "red-bright": "#fb7185",
          yellow: "#f59e0b",
          "yellow-bright": "#fbbf24",
        },
        // Game accents used across the prediction UI.
        game: {
          green: "#28c76f",
          "green-deep": "#129e53",
          red: "#f23b4e",
          "red-deep": "#d11f33",
          violet: "#9b4dff",
          "violet-deep": "#7c2dff",
          gold: "#f6c343",
          "gold-soft": "#ffe08a",
          "gold-deep": "#d99a1c",
        },
        mega: {
          gold: "#f6c343",
          "gold-soft": "#ffe08a",
          black: "#0b0e16",
        },
        // "ink" = dark surface ramp (950 darkest page → 500 lightest card line).
        ink: {
          950: "#070b18",
          900: "#0b1124",
          800: "#111a33",
          700: "#172445",
          600: "#1e2e54",
          500: "#273a66",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-head)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 10px 34px -10px rgba(59,130,246,0.55)",
        "glow-red": "0 10px 34px -10px rgba(244,63,94,0.5)",
        "glow-yellow": "0 10px 34px -10px rgba(245,158,11,0.5)",
        "glow-green": "0 10px 34px -10px rgba(27,196,125,0.5)",
        card: "0 18px 50px -28px rgba(0,0,0,0.7)",
      },
      keyframes: {
        "pulse-glow": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        pop: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.12)", opacity: "1" },
          "100%": { transform: "scale(1)" },
        },
        "win-burst": {
          "0%": { transform: "scale(0.4) rotate(-8deg)", opacity: "0" },
          "50%": { transform: "scale(1.15) rotate(3deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0)", opacity: "1" },
        },
        shake: {
          "0%,100%": { transform: "translateX(0)" },
          "20%,60%": { transform: "translateX(-5px)" },
          "40%,80%": { transform: "translateX(5px)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "count-flip": {
          "0%": { transform: "rotateX(90deg)", opacity: "0" },
          "100%": { transform: "rotateX(0)", opacity: "1" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        float: "float 4s ease-in-out infinite",
        "spin-slow": "spin-slow 18s linear infinite",
        "slide-up": "slide-up 0.4s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.4s ease both",
        pop: "pop 0.35s cubic-bezier(0.22,1,0.36,1) both",
        "win-burst": "win-burst 0.5s cubic-bezier(0.22,1,0.36,1) both",
        shake: "shake 0.45s ease",
        "count-flip": "count-flip 0.3s ease both",
      },
    },
  },
  plugins: [],
};

export default config;
