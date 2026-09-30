import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import type { Category } from "../db/db";
import { formatAmount } from "../utils/format";
import { useHaptics } from "../hooks/useHaptics";
import { usePrefersReducedMotion } from "../hooks/useMediaQuery";

interface Props {
  categories: Category[];
  currency: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSubmit: (input: { amount: number; note: string; categoryId: string }) => void;
  defaultCategoryId?: string;
}

export default function InputPad({ categories, currency, collapsed, onToggleCollapsed, onSubmit }: Props) {
  const [display, setDisplay] = useState("");
  const [note, setNote] = useState("");
  // Neutral default category — stable regardless of when the category list loads.
  const DEFAULT_CATEGORY = "other";
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY);
  const [error, setError] = useState(false);
  const haptic = useHaptics();
  const reducedMotion = usePrefersReducedMotion();

  const press = (key: string) => {
    haptic(8);
    setError(false);
    if (key === "back") {
      setDisplay((d) => d.slice(0, -1));
      return;
    }
    setDisplay((d) => {
      if (d.replace(/^0+/, "").length >= 9) return d;
      if (key === "00") return d === "" ? d : d + "00";
      if (d === "0") return key;
      return d + key;
    });
  };

  const submit = () => {
    const amount = Number(display);
    if (!amount || amount <= 0) {
      setError(true);
      haptic([10, 30, 10]);
      setTimeout(() => setError(false), 600);
      return;
    }
    setError(false);
    haptic(10);
    onSubmit({ amount, note: note.trim(), categoryId });
    // Reset the whole pad — amount, note, and category chip — for the next entry.
    setDisplay("");
    setNote("");
    setCategoryId(DEFAULT_CATEGORY);
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"];

  return (
    <motion.section
      layout={!reducedMotion}
      aria-label="Add expense pad"
      className="relative z-10 rounded-t-3xl border-t border-slate-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900"
    >
      <button
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand input pad" : "Collapse input pad"}
        className="mx-auto mb-1 flex w-full items-center justify-center gap-1 py-1 text-xs font-medium text-slate-400"
      >
        {collapsed ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        {collapsed ? "Show keypad" : "Hide keypad"}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div
            key="pad"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {/* Display */}
            <output
              className={`block w-full text-right text-4xl font-extrabold tabular-nums tracking-tight ${
                error ? "text-red-500" : ""
              }`}
              aria-live="polite"
              aria-label={`Amount: ${display ? formatAmount(Number(display), currency) : "none"}`}
            >
              {display ? formatAmount(Number(display), currency) : `${currency}0`}
            </output>

            {/* Note input */}
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you spend on? e.g. ice cream"
              aria-label="Note"
              maxLength={60}
              className="mt-2 w-full rounded-xl bg-slate-100 px-3 py-2.5 text-[15px] outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
            />

            {/* Category chips */}
            <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Category">
              {categories.map((c) => (
                <button
                  key={c.id}
                  role="radio"
                  aria-checked={categoryId === c.id}
                  onClick={() => {
                    setCategoryId(c.id);
                    haptic(8);
                  }}
                  className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                    categoryId === c.id
                      ? "border-transparent text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                  style={categoryId === c.id ? { backgroundColor: c.color } : undefined}
                >
                  <span aria-hidden>{c.icon}</span>
                  {c.name}
                </button>
              ))}
            </div>

            {/* Keypad */}
            <div className="mt-2 grid grid-cols-3 gap-2">
              {keys.map((k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  aria-label={k === "back" ? "Backspace" : `Key ${k}`}
                  className="h-[52px] rounded-2xl bg-slate-100 text-xl font-semibold text-slate-700 transition-transform active:scale-95 dark:bg-slate-800 dark:text-slate-100"
                >
                  {k === "back" ? "⌫" : k}
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Big add button — dedicated row below the keypad so it never covers the keys */}
      <div className="mt-2.5 flex justify-center">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={submit}
          aria-label="Add expense"
          className={`flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-colors active:bg-teal-700 ${
            error ? "animate-pop bg-red-500 shadow-red-500/40" : "bg-teal-600 shadow-teal-600/40"
          }`}
        >
          <Plus size={30} strokeWidth={2.5} aria-hidden />
        </motion.button>
      </div>
    </motion.section>
  );
}
