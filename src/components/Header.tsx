import { ChevronLeft, ChevronRight, Moon, Sun, ArrowUpRight } from "lucide-react";
import { monthLabel, shiftMonth } from "../utils/calc";
import { useStore } from "../store/store";

export default function Header({ month }: { month: string }) {
  const { setMonth, theme, setTheme } = useStore();
  return <header className="app-header">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5"><span className="brand-mark"><ArrowUpRight size={23} strokeWidth={3} /></span><span className="text-xl font-bold tracking-tight">spendwise<span className="text-teal-600">.</span></span></div>
      <button className="icon-button" aria-label={`Theme: ${theme}. Tap to change`} onClick={() => setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light")}>{theme === "dark" ? <Moon size={19} /> : <Sun size={19} />}</button>
    </div>
    <div className="month-navigation" role="navigation" aria-label="Month switcher"><button className="icon-button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={19} /></button><span>{monthLabel(month)}</span><button className="icon-button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={19} /></button></div>
  </header>;
}
