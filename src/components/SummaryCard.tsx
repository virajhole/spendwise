import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Pencil } from "lucide-react";
import type { Transaction } from "../db/types";
import { budgetUsedPct, remainingBalance, totalExpense } from "../utils/calc";
import { formatAmount } from "../utils/format";
import { useHaptics } from "../hooks/useHaptics";

interface Props {
  month: string;
  budget: number | undefined;
  transactions: Transaction[] | undefined;
  currency: string;
  onSetBudget: (amount: number) => void;
}

/** Slim sticky summary shown when the full card scrolls away. */
export function SlimSummary({
  remaining, pct, currency, visible,
}: {
  remaining: number;
  pct: number;
  currency: string;
  visible: boolean;
}) {
  return (
    <div
      style={{ maxHeight: visible ? 36 : 0 }}
      className="flex items-center gap-2 overflow-hidden border-t border-slate-200/60 bg-slate-100 px-3 transition-[max-height] duration-200 dark:border-slate-800/60 dark:bg-[#0f1115]"
      aria-hidden={!visible}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Remaining</span>
      <span className={`text-sm font-bold ${pct >= 100 ? "text-red-500 dark:text-red-400" : ""}`}>
        {formatAmount(remaining, currency)}
      </span>
      <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow={Math.min(100, Math.round(pct))} aria-label={`${Math.round(pct)}% of budget used`}>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: pct >= 100 ? "#ef4444" : pct >= 80 ? "#f97316" : "#0ea5a4" }}
        />
      </div>
    </div>
  );
}
export default function SummaryCard({ month, budget, transactions, currency, onSetBudget }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const haptic = useHaptics();
  const controls = useAnimationControls();
  const firstTotal = useRef(true);

  const monthTxs = (transactions ?? []).filter((t) => t.date.startsWith(month));
  const total = totalExpense(monthTxs);
  const b = budget ?? 0;
  const remaining = remainingBalance(b, monthTxs);
  const pct = budgetUsedPct(b, monthTxs);
  const over = remaining < 0 && b > 0;
  const barColor = pct >= 100 ? "#ef4444" : pct >= 80 ? "#f97316" : "#0ea5a4";

  // Gentle pulse on the Total Expense number whenever it changes (skip first mount).
  useEffect(() => {
    if (firstTotal.current) {
      firstTotal.current = false;
      return;
    }
    controls.start({
      scale: [1, 1.1, 1],
      transition: { duration: 0.3, ease: "easeOut" },
    });
  }, [total, controls]);

  const save = () => {
    const v = Number(draft.replace(/[^0-9.]/g, ""));
    haptic(10);
    onSetBudget(v > 0 ? v : 0);
    setEditing(false);
  };

  return (
    <section aria-label="Monthly summary" className="px-3 pt-2">
      <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 p-3 text-white shadow-lg shadow-teal-900/20 dark:from-teal-800 dark:to-teal-950">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-teal-100/80">
              Budget · {new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "short" })}
            </p>
            {editing ? (
              <div className="mt-0.5 flex items-center gap-1.5">
                <input
                  autoFocus
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  aria-label="Budget amount"
                  placeholder={String(b || "")}
                  className="w-24 rounded-lg bg-white/15 px-2 py-0.5 text-lg font-bold outline-none placeholder:text-teal-100/50"
                />
                <button onClick={save} className="rounded-lg bg-white px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setDraft(b ? String(b) : "");
                  setEditing(true);
                  haptic(10);
                }}
                className="group flex items-center gap-1.5 text-left"
                aria-label={`Monthly budget ${formatAmount(b, currency)}. Tap to edit`}
              >
                <span className="text-2xl font-extrabold leading-7 tracking-tight">{formatAmount(b, currency)}</span>
                <Pencil size={12} className="text-teal-100/70 group-hover:text-white" aria-hidden />
              </button>
            )}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-teal-100/80">Total Expense</p>
            <motion.p animate={controls} className="origin-right text-xl font-bold leading-6 tabular-nums">
              {formatAmount(total, currency)}
            </motion.p>
          </div>
        </div>

        <div className="mt-2">
          <div
            role="progressbar"
            aria-valuenow={Math.min(100, Math.round(pct))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${Math.round(pct)}% of budget used`}
            className="h-2 w-full overflow-hidden rounded-full bg-white/20"
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: barColor }}
              initial={false}
              animate={{ width: `${Math.min(100, pct)}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-[11px] text-teal-100/80">{over ? "Over budget" : "Remaining"}</p>
            <p className={`text-sm font-bold leading-5 ${over ? "text-red-300" : ""}`}>{formatAmount(remaining, currency)}</p>
          </div>
          <p className="text-right text-[10px] font-medium text-teal-100/80">{b > 0 ? `${Math.round(pct)}% used` : "No budget set"}</p>
        </div>
      </div>
    </section>
  );
}
