import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import RequireAuth from "./components/RequireAuth";
import { useRecurringAutoAdd } from "./hooks/useRecurringAutoAdd";
import { isSupabaseConfigured } from "./lib/supabase";
import { bootUserData } from "./store/data";
import { checkReminder } from "./utils/reminder";
import { lazy, Suspense } from "react";
const Stats = lazy(() => import("./pages/Stats"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));

/** Fixed "Offline, will sync" badge. */
function OfflineBadge() {
  const [offline, setOffline] = useState(() => (typeof navigator !== "undefined" ? !navigator.onLine : false));
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="offline-badge" role="status">
      <span aria-hidden>⚡</span> Offline, will sync
    </div>
  );
}

export default function App() {
  useRecurringAutoAdd();

  useEffect(() => {
    document.documentElement.style.height = "100%";
    checkReminder();
    // Local-only mode (Supabase not configured): skip auth, boot straight away.
    if (!isSupabaseConfigured) void bootUserData("local");

    // Preload the lazy route chunks during idle time so the first visit to
    // Stats/Settings paints instantly instead of waiting on the network.
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const preload = () => {
      void import("./pages/Stats");
      void import("./pages/Settings");
      void import("./pages/Login");
    };
    const handle: number = w.requestIdleCallback
      ? w.requestIdleCallback(preload, { timeout: 2000 })
      : window.setTimeout(preload, 1500);
    return () => {
      if (w.cancelIdleCallback) w.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  return (
    <div className="app-shell mx-auto flex max-w-[480px] flex-col bg-slate-100 dark:bg-[#0f1115] md:my-0 md:shadow-xl">
      <OfflineBadge />
      <Suspense
        fallback={
          <div className="flex flex-1 flex-col gap-3 p-4" aria-label="Loading">
            <div className="h-6 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-28 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-40 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
          </div>
        }
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
