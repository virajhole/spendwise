import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Chrome, Loader2, Wallet } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { cleanOAuthUrl, readOAuthErrorFromUrl } from "../auth/oauth";
import { isSupabaseConfigured } from "../lib/supabase";

/** Clean, mobile-first sign-in / sign-up screen. */
export default function Login() {
  const { session, initializing, signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  // OAuth failures come back as ?error=…&error_description=… — show them
  // verbatim so problems are debuggable, then scrub them from the URL.
  const [oauthError] = useState(() => readOAuthErrorFromUrl());

  useEffect(() => {
    if (oauthError) cleanOAuthUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No cloud configured (or already signed in) → nothing to do here.
  if (!isSupabaseConfigured) return <Navigate to="/" replace />;
  if (!initializing && session) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    const emailTrim = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(emailTrim)) return setError("Enter a valid email address");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    setBusy(true);
    try {
      const res = mode === "signin" ? await signIn(emailTrim, password) : await signUp(emailTrim, password);
      if (res.error) setError(res.error);
      else if (res.needsConfirmation) setInfo("Check your inbox — confirm your email, then sign in.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError("");
    setInfo("");
    const res = await signInWithGoogle();
    if (res.error) setError(res.error);
  };

  const inputCls =
    "w-full rounded-xl bg-slate-100 px-3 py-3 text-base outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500 dark:bg-slate-800";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-[calc(env(safe-area-inset-top,0px)+40px)]">
      <div className="mx-auto w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-teal-600 text-white shadow-lg shadow-teal-600/30">
            <Wallet size={30} aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">SpendWise</h1>
            <p className="mt-1 text-sm text-slate-400">
              {mode === "signin" ? "Sign in to sync your expenses across devices" : "Create an account to start tracking"}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900" aria-label={mode === "signin" ? "Sign in" : "Sign up"}>
          {oauthError ? (
            <div role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <p className="font-semibold">Google sign-in failed</p>
              <p className="mt-0.5 break-words">
                {oauthError.description} <span className="opacity-70">(error: {oauthError.error})</span>
              </p>
              <p className="mt-1 text-xs opacity-80">
                Common causes: the Google provider isn't enabled in Supabase, or your Vercel URL is missing from Authentication → URL Configuration → Redirect URLs.
              </p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          ) : null}
          {info ? (
            <p role="status" className="mb-3 rounded-xl bg-teal-600/10 px-3 py-2 text-sm font-medium text-teal-700 dark:text-teal-300">
              {info}
            </p>
          ) : null}

          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Email</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={`mt-1 ${inputCls}`}
          />

          <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password</label>
          <input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className={`mt-1 ${inputCls}`}
          />

          <button
            type="submit"
            disabled={busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 font-bold text-white shadow-md shadow-teal-600/30 active:bg-teal-700 disabled:opacity-60"
          >
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs font-medium text-slate-400" role="separator">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          or
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>

        <button
          onClick={google}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 active:bg-slate-50 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
        >
          <Chrome size={18} aria-hidden />
          Continue with Google
        </button>

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
            setInfo("");
          }}
          className="mt-5 w-full text-center text-sm font-medium text-slate-500 hover:text-teal-600 dark:text-slate-400"
        >
          {mode === "signin" ? (
            <>New here? <span className="font-bold text-teal-600 dark:text-teal-400">Create an account</span></>
          ) : (
            <>Already have an account? <span className="font-bold text-teal-600 dark:text-teal-400">Sign in</span></>
          )}
        </button>
      </div>
    </div>
  );
}
