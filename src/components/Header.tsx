import { ChevronLeft, ChevronRight, Moon, Sun, ArrowUpRight } from "lucide-react";
import { monthLabel, shiftMonth } from "../utils/calc";
import { useStore } from "../store/store";
import { useSyncExternalStore } from "react";

const subscribeTheme = (onChange: () => void) => {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

export default function Header({ month }: { month?: string }) {
  const { setMonth, theme, setTheme } = useStore();
  const prefersDark = useSyncExternalStore(subscribeTheme, systemDark, () => false);
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  return <header className="app-header">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5"><span className="brand-mark"><ArrowUpRight size={23} strokeWidth={3} /></span><span className="text-xl font-bold tracking-tight">spendwise<span className="text-teal-600">.</span></span></div>
      <button className="icon-button" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setTheme(dark ? "light" : "dark")}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
    </div>
    {month && <div className="month-navigation" role="navigation" aria-label="Month switcher"><button className="icon-button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={19} /></button><span>{monthLabel(month)}</span><button className="icon-button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={19} /></button></div>}
  </header>;
}
