import { personContacts } from "../utils/contacts";
import { Link } from "react-router-dom";
import type { Transaction } from "../db/types";
import { balances, cardBalances, isSpending, paymentTotals, PAYMENT_LABELS } from "../utils/finance";
import { totalExpense } from "../utils/calc";
import { formatAmount } from "../utils/format";
import { useRecurrings } from "../store/data";

export default function ReportOverview({ ledger, month, currency }: { ledger: Transaction[]; month: string; currency: string }) {
  const recurring = useRecurrings();
  const txs = ledger.filter(t => t.date.startsWith(month));
  const outstanding = balances(ledger);
  const cards = cardBalances(ledger);
  const fmt = (n: number) => formatAmount(n, currency);
  const metrics = [
    ["My expense", totalExpense(txs)],
    ["Purchases paid", txs.filter(isSpending).reduce((s,t) => s + t.amount, 0)],
    ["To receive · all time", outstanding.filter(b => b.direction === "in").reduce((s,b) => s + b.remaining, 0)],
    ["To repay · all time", outstanding.filter(b => b.direction === "out").reduce((s,b) => s + b.remaining, 0)],
  ] as const;
  const methods = paymentTotals(txs);
  return <>
    <div className="page-heading mt-3"><div><p className="eyebrow">THE BIG PICTURE</p><h1>Your money report.</h1></div></div>
    <div className="grid grid-cols-2 gap-3 my-5">{metrics.map(([label, amount], i) => <div className={`metric-card ${i === 0 ? "mint" : ""}`} key={label}><p>{label}</p><strong>{fmt(amount)}</strong></div>)}</div>
    <p className="text-xs text-slate-500 mb-5">Personal expense includes only your share of split bills. Purchases paid includes the full bill. Repayments aren't counted twice.</p>
    <section className="surface p-4 mb-4"><div className="section-heading"><h2>Payment breakdown</h2><Link to="/wallet">Wallet ↗</Link></div><div className="mt-3 space-y-3">{Object.entries(methods).filter(([,n]) => n > 0).map(([key, value]) => <div key={key} className="flex justify-between text-sm"><span>{PAYMENT_LABELS[key as keyof typeof PAYMENT_LABELS]}</span><strong>{fmt(value)}</strong></div>)}{!Object.values(methods).some(n => n > 0) && <p className="text-sm text-slate-500">Your first purchase starts the picture.</p>}</div></section>
    <section className="surface p-4 mb-4"><div className="section-heading"><h2>Bills & card dues</h2><Link to="/settings">Manage bills ↗</Link></div><div className="mt-3 space-y-3">{recurring.filter(r => r.active).map(r => <div key={r.id} className="flex justify-between gap-3 text-sm"><span>{r.name}<small className="block text-slate-500">Day {r.day} each month · scheduled</small></span><strong>{fmt(r.amount)}</strong></div>)}{cards.map(c => <div className="flex justify-between gap-3 text-sm" key={c.name}><span>{c.name}<small className="block text-slate-500">Unpaid recorded spending · all time</small></span><strong>{fmt(c.outstanding)}</strong></div>)}{!recurring.some(r => r.active) && !cards.length && <p className="text-sm text-slate-500">Add recurring bills in Settings or a credit card expense.</p>}</div></section>
    <section className="surface p-4 mb-4"><div className="section-heading"><h2>Who owes what</h2><Link to="/people">People ↗</Link></div><div className="mt-3 space-y-3">{personContacts(ledger).filter(c => c.receivable > 0 || c.payable > 0).map(c => <Link to={`/people?contact=${encodeURIComponent(c.key)}`} key={c.key} className="flex justify-between gap-3 text-sm"><span>{c.name}<small className="block text-slate-500">{c.net > 0 ? "You’ll get" : c.net < 0 ? "You owe" : "Net balanced"}</small></span><strong className={c.net > 0 ? "text-teal-700 dark:text-teal-400" : c.net < 0 ? "text-red-600 dark:text-red-400" : "text-slate-500"}>{fmt(Math.abs(c.net))}</strong></Link>)}{!outstanding.some(b => b.remaining > 0) && <p className="text-sm text-slate-500">No pending balances.</p>}</div></section>
  </>;
}
