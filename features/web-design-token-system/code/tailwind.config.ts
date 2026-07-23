import type { Config } from "tailwindcss";

/**
 * Design token system (Tailwind v3). The VALUE is the scale architecture, not
 * the palette: a semantic type scale with line-height/weight/tracking baked in,
 * named color/radius/shadow scales, a motion kit, and brand easing curves.
 * Regenerate the hex values and fonts per project; keep the structure.
 * Pairs with globals.css (the CSS-variable light/dark layer + component classes).
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      // ── Color scale (SKIN: regenerate per project) ──────────────────
      colors: {
        brand: {
          primary: { DEFAULT: "#1C1C1E", light: "#2C2C2E", pale: "#F2F0ED", deep: "#0A0A0B" },
          accent: { DEFAULT: "#7EB8D4", light: "#A3D0E4", pale: "#E8F4FA", deep: "#3D7A96" },
          secondary: { DEFAULT: "#C4856A", light: "#D4A08A", pale: "rgba(196,133,106,0.08)" },
          cream: { DEFAULT: "#F7F3EE", deep: "#EDE6DC" },
          ink: { DEFAULT: "#0E0E10", light: "#1C1C1E" },
        },
        semantic: {
          error: "#C4384B",
          success: "#4A9B6E",
          "success-soft": "#E8F5EE",
          warning: "#ECC94B",
          info: "#3B82F6",
        },
      },

      // ── Type scale (STRUCTURE: keep). lh/weight/tracking travel with size ──
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "system-ui", "-apple-system", "sans-serif"],
      },
      fontSize: {
        h1: ["40px", { lineHeight: "1.1", fontWeight: "700" }],
        h2: ["28px", { lineHeight: "1.15", fontWeight: "700" }],
        h3: ["20px", { lineHeight: "1.25", fontWeight: "600" }],
        subtitle: ["17px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-lg": ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        body: ["15px", { lineHeight: "1.6", fontWeight: "400" }],
        "ui-label": ["13px", { lineHeight: "1.4", fontWeight: "500", letterSpacing: "0.05em" }],
        caption: ["11px", { lineHeight: "1.4", fontWeight: "400", letterSpacing: "0.025em" }],
        eyebrow: ["10px", { lineHeight: "1.4", fontWeight: "500", letterSpacing: "0.2em" }],
      },

      // ── Radius + shadow scales (STRUCTURE: keep, values tune per project) ──
      borderRadius: { brand: "20px", "brand-sm": "16px", "brand-xs": "12px", pill: "100px" },
      boxShadow: {
        card: "0 2px 8px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)",
        "card-hover": "0 8px 24px rgba(0,0,0,0.08), 0 24px 56px rgba(0,0,0,0.12)",
        button: "0 4px 16px rgba(0,0,0,0.15), 0 12px 32px rgba(0,0,0,0.1)",
        glass: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.5)",
      },

      // ── Motion kit + brand easing. Animate transforms/opacity only ──────
      animation: {
        "gentle-float": "gentle-float 3s ease-in-out infinite",
        "spring-pop": "spring-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "soft-breathe": "soft-breathe 4s ease infinite",
        shimmer: "shimmer 2.5s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.6s ease-out both",
      },
      keyframes: {
        "gentle-float": { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        "spring-pop": { "0%": { transform: "scale(0.95)" }, "50%": { transform: "scale(1.05)" }, "100%": { transform: "scale(1)" } },
        "soft-breathe": { "0%, 100%": { opacity: "0.3" }, "50%": { opacity: "1" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "fade-in-up": { "0%": { opacity: "0", transform: "translateY(16px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      transitionTimingFunction: {
        "brand-ease": "cubic-bezier(0.4, 0, 0.2, 1)",
        "brand-spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
