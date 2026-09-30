/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"],
      manifest: {
        name: "SpendWise — Expense Tracker",
        short_name: "SpendWise",
        description: "A minimal, offline-first expense tracker",
        theme_color: "#0ea5a4",
        background_color: "#0f1115",
        display: "standalone",
        start_url: "/",
        orientation: "portrait",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => request.mode === "navigate" || url.origin === self.location.origin,
            handler: "NetworkFirst",
            options: { cacheName: "runtime-cache", expiration: { maxEntries: 50 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "node",
    globals: true,
  },
});
