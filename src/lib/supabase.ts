import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

/** True when both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Supabase client for the SpendWise frontend.
 *
 * Only the ANON key is used here — RLS (see supabase/schema.sql) makes every
 * row invisible/untouchable unless the signed-in user owns it. The
 * service_role key must never appear in frontend code or env files.
 *
 * When the env vars are missing OR empty (fresh clone, tests) we still create
 * a client with placeholders so imports never crash (`createClient` throws on
 * an empty URL); `isSupabaseConfigured` gates all real usage and the app
 * falls back to local-only (IndexedDB) mode.
 */
export const supabase: SupabaseClient = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "public-anon-key-placeholder",
  {
    auth: {
      persistSession: true, // session survives reloads / PWA restarts
      autoRefreshToken: true,
      detectSessionInUrl: true, // handles the Google OAuth redirect (?code=…)
      storageKey: "spendwise.auth",
    },
  },
);
