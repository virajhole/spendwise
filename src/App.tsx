import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Stats from "./pages/Stats";
import SettingsPage from "./pages/Settings";
import Login from "./pages/Login";
import RequireAuth from "./components/RequireAuth";
import { useRecurringAutoAdd } from "./hooks/useRecurringAutoAdd";
import { isSupabaseConfigured } from "./lib/supabase";
import { bootUserData } from "./store/data";

export default function App() {
  useRecurringAutoAdd();

  useEffect(() => {
    document.documentElement.style.height = "100%";
    // Local-only mode (Supabase not configured): skip auth, boot straight away.
    if (!isSupabaseConfigured) void bootUserData("local");
  }, []);

  return (
    <div className="mx-auto flex h-full max-w-[480px] flex-col bg-slate-100 dark:bg-[#0f1115] md:my-0 md:shadow-xl">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
