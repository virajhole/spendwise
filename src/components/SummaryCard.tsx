import { useState } from "react";
import { Pencil, TrendingUp } from "lucide-react";
import type { Transaction } from "../db/types";
import { budgetUsedPct, remainingBalance, totalExpense } from "../utils/calc";
import { formatAmount } from "../utils/format";

interface Props { month: string; budget: number | undefined; transactions: Transaction[] | undefined; currency: string; onSetBudget: (amount: number) => void }

export function SlimSummary({ remaining, pct, currency, visible }: { remaining: number; pct: number; currency: string; visible: boolean }) {
  return <div className={`slim-summary ${visible ? "visible" : ""}`} aria-hidden={!visible}><span>{pct > 100 ? "Over budget" : "Remaining"}</span><strong>{formatAmount(remaining, currency)}</strong></div>;
}

export default function SummaryCard({ month, budget, transactions, currency, onSetBudget }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const txs = (transactions ?? []).filter(t => t.date.startsWith(month));
  const total = totalExpense(txs);
  const b = budget ?? 0;
  const remaining = remainingBalance(b, txs);
  const pct = budgetUsedPct(b, txs);
  const over = b > 0 && remaining < 0;
  const save = () => { const value = Number(draft); if (Number.isFinite(value) && value >= 0) { onSetBudget(value); setEditing(false); } };
  return <section className="px-4 pt-4" aria-label="Monthly summary">
    <div className="summary-card">
      <div className="flex items-center justify-between gap-2"><p className="text-sm text-slate-500">Your spending, in focus</p><span className="summary-badge"><TrendingUp size={13} /> THIS MONTH</span></div>
      <p className="mt-5 text-xs font-medium text-slate-500">Personal expense</p>
      <p className="mt-1 text-[38px] leading-tight font-semibold tracking-tight tabular-nums">{transactions ? formatAmount(total, currency) : "…"}</p>
      <div className="mt-6 flex justify-between gap-3">
        <div><p className="text-xs text-slate-500">Monthly budget</p>{editing ? <div className="flex gap-2 mt-1"><input autoFocus aria-label="Budget amount" className="w-24 rounded-lg border border-teal-500 px-2 py-1 bg-transparent" inputMode="decimal" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} /><button className="small-button" onClick={save}>Save</button></div> : <button className="flex items-center gap-2 min-h-9 font-semibold" aria-label={`Monthly budget ${formatAmount(b, currency)}. Tap to edit`} onClick={() => { setDraft(String(b || "")); setEditing(true); }}>{formatAmount(b, currency)}<Pencil size={13} className="text-slate-400" /></button>}</div>
        <div className="text-right"><p className="text-xs text-slate-500">{over ? "Over budget" : "Remaining"}</p><p className={`min-h-9 flex items-center justify-end font-semibold ${over ? "text-red-500" : "text-teal-700 dark:text-teal-400"}`}>{formatAmount(remaining, currency)}</p></div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-teal-100 dark:bg-slate-800" role="progressbar" aria-label="Budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(pct))}><div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-teal-600"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <p className="mt-2 text-xs text-slate-500">{b > 0 ? `${Math.round(pct)}% of your budget used` : "Set a budget. Give your money a plan."}</p>
    </div>
  </section>;
}
