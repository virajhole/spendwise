import { spawnSync } from "node:child_process";

/**
 * Production build for e2e tests with Supabase env vars CLEARED so the app
 * runs in local-only (IndexedDB) mode — deterministic, no network, no real
 * data. Vercel deployments use the real env vars from the dashboard.
 */
const env = { ...process.env, VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "" };
const res = spawnSync("npx", ["vite", "build"], { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(res.status ?? 1);
