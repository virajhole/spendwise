import { ChevronLeft, ChevronRight, Moon, Settings, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import { monthLabel, shiftMonth } from "../utils/calc";
import { useStore } from "../store/store";

interface Props {
  month: string;
}

export default function Header({ month }: Props) {
  const { setMonth, theme, setTheme } = useStore();

  const cycleTheme = () => {
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  };

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Sun;

  return (
    <header className="sticky top-0 z-20 bg-slate-100/95 px-3 pb-1 pt-[calc(env(safe-area-inset-top,0px)+8px)] backdrop-blur dark:bg-[#0f1115]/95">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold tracking-tight">SpendWise</h1>
        <div className="flex items-center gap-0.5">
          <button
            onClick={cycleTheme}
            aria-label={`Theme: ${theme}. Tap to change`}
            className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ThemeIcon size={18} aria-hidden />
          </button>
          <Link
            to="/settings"
            aria-label="Settings"
            className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Settings size={18} aria-hidden />
          </Link>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1" role="navigation" aria-label="Month switcher">
        <button
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="Previous month"
          className="rounded-full p-1 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <span className="min-w-[130px] text-center text-xs font-semibold">{monthLabel(month)}</span>
        <button
          onClick={() => setMonth(shiftMonth(month, 1))}
          aria-label="Next month"
          className="rounded-full p-1 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>
    </header>
  );
}
