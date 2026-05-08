import type { Config } from "tailwindcss";

/**
 * PsiClinic — paleta teal (saúde mental, confiabilidade clínica).
 * Estrutura espelha o token system do Emotion Care para consistência visual.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Marca
        primary: {
          DEFAULT: "#0e7490",      // teal-700
          hover: "#0891b2",        // cyan-600
          active: "#155e75",       // cyan-800
          light: "#cffafe",        // cyan-100
          lighter: "#ecfeff",      // cyan-50
          border: "#67e8f9",       // cyan-300
          dark: "#164e63",         // cyan-900
          fg: "#ffffff",
          900: "#164e63",
        },
        accent: { DEFAULT: "#7c3aed", fg: "#ffffff" },

        // Marca / texto
        brand: {
          text: "#164e63",          // cyan-900
          "text-2": "#134e4a",      // teal-900
          muted: "#6b7280",         // gray-500
          border: "#e5e7eb",        // gray-200
          "bg-muted": "#f0fdfa",    // teal-50
          "bg-subtle": "#ecfeff",   // cyan-50
        },

        // Estados
        success: { DEFAULT: "#16a34a", bg: "#dcfce7", border: "#86efac" },
        warning: { DEFAULT: "#d97706", bg: "#fef3c7", border: "#fcd34d" },
        error: { DEFAULT: "#dc2626", bg: "#fee2e2", border: "#fecaca" },
        info: { DEFAULT: "#1d4ed8", bg: "#dbeafe", border: "#93c5fd" },

        // Aliases
        surface: "#ffffff",
        border: "#e5e7eb",
        muted: { DEFAULT: "#78716c", fg: "#fafaf9" },
        danger: "#dc2626",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        display: ["Poppins", "Inter", "ui-sans-serif"],
      },
      fontSize: {
        "heading-1": ["32px", { lineHeight: "40px", fontWeight: "700" }],
        "heading-2": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "heading-3": ["17px", { lineHeight: "24px", fontWeight: "500" }],
        "heading-4": ["14px", { lineHeight: "20px", fontWeight: "500" }],
        body: ["15px", { lineHeight: "22px" }],
        "body-sm": ["14px", { lineHeight: "20px" }],
        caption: ["12px", { lineHeight: "16px" }],
        "label-upper": ["11px", { lineHeight: "14px", letterSpacing: "0.06em", fontWeight: "600" }],
      },
      spacing: {
        "space-1": "4px",
        "space-2": "8px",
        "space-3": "12px",
        "space-4": "16px",
        "space-5": "20px",
        "space-6": "24px",
        "space-8": "32px",
        "space-10": "40px",
        "sidebar": "260px",
        "sidebar-collapsed": "76px",
        "sidebar-mobile": "280px",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        xs: "0 1px 2px rgba(0,0,0,.04)",
        card: "0 1px 2px rgba(0,0,0,.04), 0 1px 1px rgba(0,0,0,.03)",
        focus: "0 0 0 3px rgba(14, 116, 144, 0.18)",
      },
      transitionTimingFunction: {
        sidebar: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: { 280: "280ms" },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(20px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "zoom-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        // Onda de 3 dots: cada bolinha pulsa em delay diferente (loop)
        "pulse-dot": {
          "0%, 80%, 100%": { transform: "scale(0.6)", opacity: "0.4" },
          "40%": { transform: "scale(1)", opacity: "1" },
        },
        // Skeleton shimmer — gradiente que desliza p/ direita
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "zoom-in": "zoom-in 0.2s ease-out",
        "pulse-dot": "pulse-dot 1.2s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
