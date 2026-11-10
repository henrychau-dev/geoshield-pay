/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        ink: {
          950: "#0B1120",
          900: "#111827",
          800: "#1E293B",
        },
        shield: {
          blue: "#2563EB",
          cyan: "#06B6D4",
          sky: "#0EA5E9",
          green: "#22C55E",
          red: "#EF4444",
          amber: "#F59E0B",
          violet: "#8B5CF6",
        },
      },
      animation: {
        "pulse-red": "pulseRed 1.6s ease-in-out infinite",
        "float-slow": "floatSlow 7s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        "breathe": "breathe 3s ease-in-out infinite",
      },
      keyframes: {
        pulseRed: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(239,68,68,0.45)" },
          "50%": { boxShadow: "0 0 0 14px rgba(239,68,68,0)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-14px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        breathe: {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.04)" },
        },
      },
    },
  },
  plugins: [],
};
