import { BarChart3, Home, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useHaptics } from "../hooks/useHaptics";

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/stats", label: "Stats", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function BottomNav() {
  const haptic = useHaptics();
  return (
    <nav
      aria-label="Main"
      className="z-10 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom,0px)] dark:border-slate-800 dark:bg-slate-900"
    >
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          onClick={() => haptic(10)}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
              isActive ? "text-teal-600 dark:text-teal-400" : "text-slate-400"
            }`
          }
        >
          <Icon size={22} aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
