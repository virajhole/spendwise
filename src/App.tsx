import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Stats from "./pages/Stats";
import SettingsPage from "./pages/Settings";
import BottomNav from "./components/BottomNav";
import LockScreen from "./components/LockScreen";
import { useRecurringAutoAdd } from "./hooks/useRecurringAutoAdd";
import { getStoredPin } from "./hooks/useAppLock";

export default function App() {
  useRecurringAutoAdd();
  const pin = getStoredPin();

  useEffect(() => {
    document.documentElement.style.height = "100%";
  }, []);

  return (
    <div className="mx-auto flex h-full max-w-[480px] flex-col bg-slate-100 dark:bg-[#0f1115] md:my-0 md:shadow-xl">
      {pin ? <LockScreen /> : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomNav />
      </div>
    </div>
  );
}
