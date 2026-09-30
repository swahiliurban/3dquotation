import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefbf5",
          100: "#d6f6e4",
          200: "#b1ebcb",
          300: "#7ad9a6",
          400: "#46c17f",
          500: "#1f9b5f",
          600: "#0f7a49",
          700: "#0b5d47",
          800: "#0c4a3a",
          900: "#0b3f32",
        },
        sand: {
          50: "#fafaf8",
          100: "#f5f5f0",
          200: "#e9e8df",
          300: "#d6d2c5",
          400: "#b7b1a0",
          500: "#918a77",
        },
      },
      boxShadow: {
        soft: "0 24px 60px -24px rgba(15, 122, 73, 0.22)",
        card: "0 20px 45px -28px rgba(15, 23, 42, 0.2)",
      },
      backgroundImage: {
        grid: "radial-gradient(circle at top right, rgba(31, 155, 95, 0.08), transparent 34%), linear-gradient(rgba(11, 93, 71, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(11, 93, 71, 0.04) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "auto, 32px 32px, 32px 32px",
      },
      fontFamily: {
        sans: ["Manrope", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
