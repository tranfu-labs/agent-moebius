import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}", "./.storybook/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        rail: "var(--rail)",
        card: "var(--card)",
        sunken: "var(--sunken)",
        input: "var(--input)",
        ink: "var(--ink)",
        sub: "var(--sub)",
        hint: "var(--hint)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        sel: "var(--sel)",
        hover: "var(--hover)",
        accent: "var(--accent)",
        "accent-fg": "var(--accent-fg)",
        pass: "var(--pass)",
        danger: "var(--danger)",
        "ava-bg": "var(--ava-bg)",
        "ava-fg": "var(--ava-fg)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        destructive: "var(--destructive)",
        "destructive-foreground": "var(--destructive-foreground)",
        border: "var(--border)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        ring: "var(--ring)"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      boxShadow: {
        overlay: "0 10px 28px rgba(0,0,0,0.13),0 2px 6px rgba(0,0,0,0.08)"
      },
      fontFamily: {
        sans: [
          "\"PingFang SC\"",
          "\"Microsoft YaHei\"",
          "\"Segoe UI\"",
          "system-ui",
          "-apple-system",
          "sans-serif"
        ],
        mono: ["\"SF Mono\"", "Menlo", "Consolas", "monospace"]
      },
      keyframes: {
        breathe: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: ".35" }
        }
      },
      animation: {
        breathe: "breathe 2s ease-in-out infinite"
      }
    }
  },
  plugins: []
} satisfies Config;

export default config;
