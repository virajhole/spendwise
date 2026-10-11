import { useRef, useState } from "react";
import { CreditCard, Wallet as WalletIcon, Trash2 } from "lucide-react";
import Header from "../components/Header";
import Sheet from "../components/Sheet";
import PaymentFields from "../components/PaymentFields";
import { useLedger, saveExpense, deleteExpense } from "../store/data";
import { useStore } from "../store/store";
import { cardBalances, paymentTotals, PAYMENT_LABELS } from "../utils/finance";
import { currentTime, todayISO, formatAmount } from "../utils/format";
import type { FinanceDetails } from "../db/types";

export default function Wallet() {
  const ledger = useLedger();
  const { month, currency } = useStore();
  const cards = cardBalances(ledger ?? []);
  const methods = paymentTotals((ledger ?? []).filter(t => t.date.startsWith(month)));
  const [finance, setFinance] = useState<FinanceDetails | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const fmt = (n: number) => formatAmount(n, currency);
  const save = async () => {
    if (!finance || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const saved = await saveExpense({ amount: Number(amount), note: `Card payment · ${finance.cardName}`, categoryId: "", date, time: currentTime(), finance });
      if (saved) setFinance(null); else setError("Couldn't save. Check the amount and payment details.");
    } finally { lock.current = false; setBusy(false); }
  };
  return <div className="page-layout"><Header month={month} /><div className="page-scroll">
    <div className="page-heading"><div><p className="eyebrow">YOUR MONEY, EVERYWHERE</p><h1>One clear picture.</h1></div><div className="page-icon"><WalletIcon size={24} /></div></div>
    <p className="page-subtitle">Know how you pay, and what's left on your cards.</p>
    <div className="section-heading mt-7"><h2>Spending by payment</h2><span>This month</span></div>
    {!ledger ? <p role="status" className="empty-state">Loading wallet…</p> : <div className="surface mt-3 px-4">{Object.entries(methods).map(([key, total]) => <div key={key} className="flex items-center justify-between py-4 border-b last:border-0 border-slate-100 dark:border-slate-800"><span className="text-sm">{PAYMENT_LABELS[key as keyof typeof PAYMENT_LABELS]}</span><strong>{fmt(total)}</strong></div>)}</div>}
    <p className="mt-2 text-xs text-slate-500">Full purchase amounts, including friends' shares. Loans and repayments are excluded. Older entries stay “Not recorded”.</p>
    <div className="section-heading mt-7"><h2>Your credit cards</h2><span>All time</span></div>
    {!cards.length ? <div className="empty-state"><CreditCard className="mx-auto mb-3 text-teal-600" /><strong>Your cards belong here.</strong><p>Add an expense with Credit card and a card name to get started.</p></div> : <div className="space-y-4 mt-3">{cards.map(card => <article className="wallet-card" key={card.name}>
      <div className="flex justify-between items-center"><span className="font-semibold">{card.name}</span><CreditCard size={24} /></div>
      <p className="mt-6 text-xs opacity-70">{card.outstanding < 0 ? "Credit balance" : "Unpaid recorded spending"}</p><strong className="block text-3xl font-semibold mt-1 tracking-tight">{fmt(Math.abs(card.outstanding))}</strong>
      <div className="flex justify-between text-xs mt-5 opacity-80"><span>Charged {fmt(card.spent)}</span><span>Repaid {fmt(card.paid)}</span></div>
      <button className="mt-5 w-full rounded-xl bg-white/15 border border-white/20 py-3 text-sm font-semibold" onClick={() => { setFinance({ kind: "card_payment", paymentMethod: "upi", cardName: card.name }); setAmount(card.outstanding > 0 ? String(card.outstanding) : ""); setDate(todayISO()); setError(""); }}>Record bill payment</button>
    </article>)}</div>}
    <p className="mt-4 text-xs text-slate-500">Balances use entries recorded in this app. Card bill payments reduce your dues without adding another expense.</p>
    {!!ledger?.some(t => t.finance?.kind === "card_payment") && <details className="surface mt-5 p-4"><summary className="text-sm font-semibold">Card payment history</summary>{ledger.filter(t => t.finance?.kind === "card_payment").map(t => <div className="flex items-center gap-2 py-3" key={t.id}><div className="min-w-0 flex-1"><p className="text-sm truncate">{t.finance?.cardName}</p><p className="text-xs text-slate-500">{t.date} · {fmt(t.amount)}</p></div><button className="icon-button text-red-500" aria-label={`Delete payment ${t.amount}`} onClick={() => void deleteExpense(t.id)}><Trash2 size={17} /></button></div>)}</details>}
  </div>
  {finance && <Sheet title="Record card payment" onClose={() => { if (!busy) setFinance(null); }}><form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(); }}>
    <label className="field-label">Amount ({currency})<input autoFocus required type="number" min="0.01" step="0.01" inputMode="decimal" className="field amount-field" value={amount} onChange={e => setAmount(e.target.value)} /></label>
    <PaymentFields value={finance} onChange={setFinance} repayment />
    <label className="field-label">Payment date<input required type="date" className="field" value={date} onChange={e => setDate(e.target.value)} /></label>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}<button className="primary-button w-full" disabled={busy}>{busy ? "Saving…" : "Save payment"}</button>
  </form></Sheet>}
  </div>;
}
