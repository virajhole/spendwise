import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { cleanOAuthUrl } from "./oauth";
import { bootUserData, resetDataStore } from "../store/data";

interface AuthResult {
  error?: string;
  needsConfirmation?: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True while the initial session lookup is still running. */
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setInitializing(false));

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      // INITIAL_SESSION carries a persisted session on app restart;
      // bootUserData() is idempotent per user, so double-fires are safe.
      if (event === "INITIAL_SESSION" && nextSession?.user) {
        // OAuth/PKCE returns land with ?code=… (or #access_token=…): the
        // client consumed them (detectSessionInUrl: true) — now scrub them
        // from the address bar so refresh/share never re-processes them.
        cleanOAuthUrl();
        void bootUserData(nextSession.user.id);
      } else if (event === "SIGNED_IN" && nextSession?.user) {
        cleanOAuthUrl();
        void bootUserData(nextSession.user.id);
        // After a successful sign-in (password or OAuth redirect) always land
        // on the dashboard. Deep links like /stats survive restarts because
        // they only fire INITIAL_SESSION.
        navigate("/", { replace: true });
      } else if (event === "SIGNED_OUT") {
        resetDataStore();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    initializing,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? { error: messageOf(error) } : {};
    },
    signUp: async (email, password) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: messageOf(error) };
      // If "Confirm email" is enabled, there is no session until the user
      // clicks the link in their inbox.
      return data.session ? {} : { needsConfirmation: true };
    },
    signInWithGoogle: async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      return error ? { error: messageOf(error) } : {};
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
