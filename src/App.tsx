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
  }, []);

  return (
    <div className="app-shell mx-auto flex max-w-[480px] flex-col bg-slate-100 dark:bg-[#0f1115] md:my-0 md:shadow-xl">
      <OfflineBadge />
      <Suspense fallback={<div className="flex-1" />}>
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
