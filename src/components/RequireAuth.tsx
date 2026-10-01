import { Outlet, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { isSupabaseConfigured } from "../lib/supabase";
import BottomNav from "./BottomNav";
import LockScreen from "./LockScreen";
import MigrationPrompt from "./MigrationPrompt";
import { getStoredPin } from "../hooks/useAppLock";

function Splash() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center" aria-label="Loading">
      <Loader2 size={28} className="animate-spin text-teal-600" aria-hidden />
    </div>
  );
}

/**
 * Gate for every data route. In cloud mode it requires a session (redirecting
 * to /login otherwise); when Supabase env vars are absent the app runs in
 * local-only mode and passes straight through.
 */
export default function RequireAuth() {
  const { session, initializing } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <>
        {getStoredPin() ? <LockScreen /> : null}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Outlet />
          <BottomNav />
        </div>
        <MigrationPrompt />
      </>
    );
  }

  if (initializing) return <Splash />;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <>
      {getStoredPin() ? <LockScreen /> : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Outlet />
        <BottomNav />
      </div>
      <MigrationPrompt />
    </>
  );
}
