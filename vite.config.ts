import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          ui: ["lucide-react", "sonner"],
          data: ["zustand", "react-hook-form", "date-fns", "clsx"],
          pdf: ["html2canvas", "jspdf", "pdfjs-dist"],
          ocr: ["tesseract.js"],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "apple-touch-icon.png",
        "mask-icon.svg",
        "pwa-192.png",
        "pwa-512.png",
        "pwa-maskable-192.png",
        "pwa-maskable-512.png",
        "offline.html",
      ],
      manifest: {
        id: "/",
        name: "QuoteFlow - Quotations & Invoices",
        short_name: "QuoteFlow",
        description: "Create, manage, export, and share quotations and invoices on any device.",
        theme_color: "#0f7a49",
        background_color: "#f5fbf8",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone", "browser"],
        scope: "/",
        start_url: "/",
        orientation: "any",
        categories: ["business", "finance", "productivity"],
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "/pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ],
        shortcuts: [
          {
            name: "New quotation",
            short_name: "Quotation",
            description: "Create a new quotation quickly",
            url: "/quotations/new",
            icons: [
              {
                src: "/pwa-192.png",
                sizes: "192x192",
                type: "image/png"
              }
            ]
          },
          {
            name: "New invoice",
            short_name: "Invoice",
            description: "Create a new invoice quickly",
            url: "/invoices/new",
            icons: [
              {
                src: "/pwa-192.png",
                sizes: "192x192",
                type: "image/png"
              }
            ]
          },
          {
            name: "View records",
            short_name: "Records",
            description: "Open saved quotations and invoices",
            url: "/records",
            icons: [
              {
                src: "/pwa-192.png",
                sizes: "192x192",
                type: "image/png"
              }
            ]
          }
        ]
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}"],
      },
      devOptions: {
        enabled: false,
      }
    })
  ]
});
