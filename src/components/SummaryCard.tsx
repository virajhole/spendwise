import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Pencil } from "lucide-react";
import type { Category, Transaction } from "../db/db";
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
      scale: [1, 1.12, 1],
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
    <section aria-label="Monthly summary" className="px-4">
      <div className="rounded-3xl bg-gradient-to-br from-teal-600 to-teal-800 p-5 text-white shadow-lg shadow-teal-900/20 dark:from-teal-800 dark:to-teal-950">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-teal-100/80">
              Monthly Budget · {new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "short" })}
            </p>
            {editing ? (
              <div className="mt-1 flex items-center gap-2">
                <input
                  autoFocus
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  aria-label="Budget amount"
                  placeholder={String(b || "")}
                  className="w-28 rounded-xl bg-white/15 px-3 py-1.5 text-xl font-bold outline-none placeholder:text-teal-100/50"
                />
                <button onClick={save} className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-teal-800">
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
                className="group flex items-center gap-2 text-left"
                aria-label={`Monthly budget ${formatAmount(b, currency)}. Tap to edit`}
              >
                <span className="text-3xl font-extrabold tracking-tight">{formatAmount(b, currency)}</span>
                <Pencil size={14} className="text-teal-100/70 group-hover:text-white" aria-hidden />
              </button>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-teal-100/80">Total Expense</p>
            <motion.p animate={controls} className="origin-right text-2xl font-bold tabular-nums">
              {formatAmount(total, currency)}
            </motion.p>
          </div>
        </div>

        <div className="mt-4">
          <div
            role="progressbar"
            aria-valuenow={Math.min(100, Math.round(pct))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${Math.round(pct)}% of budget used`}
            className="h-2.5 w-full overflow-hidden rounded-full bg-white/20"
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: barColor }}
              initial={false}
              animate={{ width: `${Math.min(100, pct)}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
          <div className="mt-2 flex items-end justify-between">
            <div>
              <p className="text-xs text-teal-100/80">{over ? "Over budget" : "Remaining Balance"}</p>
              <p className={`text-xl font-bold ${over ? "text-red-300" : ""}`}>{formatAmount(remaining, currency)}</p>
            </div>
            <p className="text-xs font-medium text-teal-100/80">{b > 0 ? `${Math.round(pct)}% used` : "No budget set"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
