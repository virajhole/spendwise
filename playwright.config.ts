import { defineConfig } from "@playwright/test";

/**
 * E2E tests run against the production build in local-only mode (Supabase
 * mocked out by the absence of env vars — data lives in IndexedDB).
 * Viewport matches the target device: Samsung Galaxy S24, 360x780.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 360, height: 780 },
    hasTouch: true,
    isMobile: true,
    locale: "en-US",
  },
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium", channel: "chrome" } }],
});
