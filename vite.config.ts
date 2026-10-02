/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = (env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"],
        manifest: {
          id: "/",
          name: "SpendWise — Expense Tracker",
          short_name: "SpendWise",
          description: "A minimal expense tracker that syncs across your devices",
          theme_color: "#0ea5a4",
          background_color: "#0f1115",
          display: "standalone",
          start_url: "/",
          scope: "/",
          orientation: "portrait",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          runtimeCaching: [
            // CRITICAL: never cache Supabase API traffic (auth tokens, REST
            // reads, realtime). NetworkOnly guarantees data can never go stale
            // through the service worker — every request hits the network.
            ...(supabaseUrl
              ? [
                  {
                    urlPattern: new RegExp(`^${escapeRe(supabaseUrl)}`),
                    handler: "NetworkOnly" as const,
                    options: { cacheName: "supabase-bypass" },
                  },
                ]
              : []),
            // App shell: network-first so updates land quickly, cache as
            // offline fallback. Same-origin only — cross-origin (Supabase)
            // requests never match this rule.
            {
              urlPattern: ({ request, url }) => request.mode === "navigate" || url.origin === self.location.origin,
              handler: "NetworkFirst",
              options: { cacheName: "runtime-cache", expiration: { maxEntries: 50 } },
            },
          ],
        },
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          // Split stable vendor libraries into their own cacheable chunks so
          // app-code changes don't re-download everything.
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("framer-motion")) return "vendor-motion";
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("dexie") || id.includes("@tanstack")) return "vendor-data";
            if (id.includes("/react") || id.includes("react-dom") || id.includes("scheduler") || id.includes("lucide")) return "vendor-react";
            return "vendor-misc";
          },
        },
      },
    },
    test: {
      environment: "node",
      globals: true,
      setupFiles: ["./src/test-setup.ts"],
    },
  };
});
