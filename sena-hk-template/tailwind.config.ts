import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        cyanGlow: "rgb(var(--glow-cyan) / <alpha-value>)",
        violetGlow: "rgb(var(--glow-violet) / <alpha-value>)",
        magentaGlow: "rgb(var(--glow-magenta) / <alpha-value>)",
        cardBorder: "rgb(var(--card-border) / <alpha-value>)"
      },
      boxShadow: {
        glow: "0 0 32px rgb(var(--glow-cyan) / 0.24), 0 0 72px rgb(var(--glow-violet) / 0.16)",
        soft: "0 24px 80px rgb(15 23 42 / 0.14)"
      },
      backgroundImage: {
        "sena-radial": "radial-gradient(circle at 50% 16%, rgb(var(--page-glow) / 0.64), transparent 30%), radial-gradient(circle at 16% 0%, rgb(var(--page-glow-soft) / 0.88), transparent 32%), radial-gradient(circle at 84% 4%, rgb(var(--page-glow-strong) / 0.22), transparent 34%)",
        "grid-lines": "linear-gradient(rgb(var(--foreground) / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--foreground) / 0.06) 1px, transparent 1px)"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" }
        },
        gridMove: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "80px 80px" }
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" }
        },
        shimmer: {
          "0%": { transform: "translateX(-140%)" },
          "100%": { transform: "translateX(140%)" }
        }
      },
      animation: {
        float: "float 7s ease-in-out infinite",
        gridMove: "gridMove 18s linear infinite",
        pulseGlow: "pulseGlow 3.5s ease-in-out infinite",
        shimmer: "shimmer 2.8s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
