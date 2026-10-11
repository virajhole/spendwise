import { useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus, Users, Check, Trash2 } from "lucide-react";
import Header from "../components/Header";
import Sheet from "../components/Sheet";
import PaymentFields from "../components/PaymentFields";
import { useLedger, useCategories, saveExpense, deleteExpense } from "../store/data";
import { useStore } from "../store/store";
import { balances, equalShares, money, validateFinance, type Balance } from "../utils/finance";
import { currentTime, todayISO, formatAmount } from "../utils/format";
import type { FinanceDetails, Transaction } from "../db/types";
import { pushToast } from "../store/toast";

export default function People() {
  const ledger = useLedger();
  const categories = useCategories();
  const { currency, month } = useStore();
  const [mode, setMode] = useState<"lent" | "borrowed" | "split" | null>(null);
  const [settling, setSettling] = useState<Balance | null>(null);
  const [amount, setAmount] = useState("");
  const [person, setPerson] = useState("");
  const [names, setNames] = useState("Arbaz, Rini, Tisbhina, Kishon");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [splitMode, setSplitMode] = useState("equal");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [finance, setFinance] = useState<FinanceDetails>({ kind: "lent", paymentMethod: "upi" });
  const [categoryId, setCategoryId] = useState("");
  const [filter, setFilter] = useState("pending");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const all = useMemo(() => balances(ledger ?? []), [ledger]);
  const received = money(all.filter(b => b.direction === "in").reduce((s, b) => s + b.remaining, 0));
  const owed = money(all.filter(b => b.direction === "out").reduce((s, b) => s + b.remaining, 0));
  const participants = ["Me", ...names.split(",").map(n => n.trim()).filter(Boolean)];
  const shares = splitMode === "equal" ? equalShares(Number(amount) || 0, participants) : participants.map((name, i) => ({ id: String(i), name, isMe: i === 0, amount: Number(custom[name] || 0) }));
  const fmt = (n: number) => formatAmount(n, currency);
  const reset = () => { setAmount(""); setPerson(""); setNote(""); setError(""); setDate(todayISO()); setDueDate(""); setFinance({ kind: "lent", paymentMethod: "upi" }); setCustom({}); setSplitMode("equal"); };
  const open = (next: "lent" | "borrowed" | "split") => { reset(); setMode(next); };
  const close = () => { if (!busy) { setMode(null); setSettling(null); setError(""); } };
  const save = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      let details: FinanceDetails = { ...finance, kind: mode ?? "settlement", dueDate: dueDate || undefined };
      if (settling) {
        const live = balances(ledger ?? []).find(b => b.key === settling.key);
        if (!live || Number(amount) > live.remaining) throw new Error("Repayment cannot exceed the outstanding balance");
        if (date < live.transaction.date) throw new Error("Repayment date cannot be before the original entry");
        details = { ...finance, kind: "settlement", person: settling.name, settlesId: settling.transaction.id, settlesShareId: settling.shareId, direction: settling.direction };
      } else if (mode === "split") details.shares = shares;
      else details.person = person.trim();
      validateFinance(Number(amount), details);
      const saved = await saveExpense({ amount: Number(amount), note: note.trim() || (settling ? `Repayment · ${settling.name}` : mode === "split" ? "Shared bill" : `Udhaar · ${person.trim()}`), categoryId: mode === "split" ? categoryId || categories.find(c => c.name === "Food")?.id || categories[0]?.id || "" : "", date, time: currentTime(), finance: details });
      if (saved) { setMode(null); setSettling(null); pushToast({ kind: "success", message: settling ? "Repayment recorded" : "Entry saved" }); }
      else setError("Couldn't save this entry. Please retry.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save"); }
    finally { lock.current = false; setBusy(false); }
  };
  const remove = async (t: Transaction) => {
    if (busy) return;
    setBusy(true);
    try { await deleteExpense(t.id); } finally { setBusy(false); }
  };
  const visible = all.filter(b => filter === "settled" ? b.remaining === 0 : b.remaining > 0);
  return <div className="page-layout"><Header month={month} />
    <div className="page-scroll">
      <div className="page-heading"><div><p className="eyebrow">MONEY & FRIENDS</p><h1>Keep it settled.</h1></div><div className="page-icon"><Users size={24} /></div></div>
      <p className="page-subtitle">Split the bill. Keep the friendship simple.</p>
      <div className="grid grid-cols-2 gap-3 my-5">
        <div className="metric-card mint"><ArrowDownLeft size={20} /><p>You'll get</p><strong>{ledger ? fmt(received) : "…"}</strong></div>
        <div className="metric-card"><ArrowUpRight size={20} /><p>You owe</p><strong>{ledger ? fmt(owed) : "…"}</strong></div>
      </div>
      <div className="grid grid-cols-3 gap-2"><button className="action-tile" onClick={() => open("lent")}><ArrowUpRight size={20} />Lend money</button><button className="action-tile" onClick={() => open("borrowed")}><ArrowDownLeft size={20} />Borrowed</button><button className="action-tile" onClick={() => open("split")}><Plus size={20} />Split a bill</button></div>
      <div className="section-heading mt-7"><h2>People & balances</h2><span>All time</span></div>
      <div className="segmented my-3"><button className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>Pending</button><button className={filter === "settled" ? "active" : ""} onClick={() => setFilter("settled")}>Settled</button></div>
      {!ledger ? <p role="status" className="empty-state">Loading your balances…</p> : !visible.length ? <div className="empty-state"><Check className="mx-auto mb-3 text-teal-600" /><strong>{filter === "pending" ? "All clear, all good." : "No settlements yet"}</strong><p>{filter === "pending" ? "Add an udhaar entry or split your first bill." : "Completed balances will appear here."}</p></div> :
        <div className="space-y-3">{visible.map(b => <article className="surface p-4" key={b.key}>
          <div className="flex items-start gap-3"><span className="person-avatar">{b.name.slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><h3 className="font-semibold truncate">{b.name}</h3><p className="text-xs text-slate-500 truncate">{b.transaction.note} · {b.transaction.date}</p></div><div className="text-right shrink-0"><strong className={b.direction === "in" ? "text-teal-700 dark:text-teal-400" : ""}>{fmt(b.remaining)}</strong><p className="text-xs text-slate-500">{b.remaining === 0 ? "Settled" : b.direction === "in" ? "owes you" : "you owe"}</p></div></div>
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500"><span>Share {fmt(b.original)}{b.transaction.finance?.dueDate ? ` · Due ${b.transaction.finance.dueDate}` : ""}</span>{b.remaining > 0 && <button className="small-button" onClick={() => { reset(); setSettling(b); setAmount(String(b.remaining)); }}>Record payment</button>}</div>
        </article>)}</div>}
      {!!ledger?.some(t => t.finance && ["lent", "borrowed", "split", "settlement"].includes(t.finance.kind)) && <details className="surface mt-5 p-4"><summary className="cursor-pointer font-semibold text-sm">Entry & repayment history</summary><p className="mt-2 text-xs text-slate-500">To correct a shared entry, remove its repayments first, then delete and recreate it.</p>{ledger.filter(t => t.finance && ["lent", "borrowed", "split", "settlement"].includes(t.finance.kind)).sort((a,b) => b.createdAt - a.createdAt).map(t => <div key={t.id} className="flex items-center gap-3 py-3 border-b border-slate-100 dark:border-slate-800"><div className="min-w-0 flex-1"><p className="text-sm truncate">{t.note}</p><p className="text-xs text-slate-500">{t.date} · {t.finance?.kind} · {fmt(t.amount)}</p></div><button disabled={busy || ledger.some(s => s.finance?.settlesId === t.id)} className="icon-button text-red-500" aria-label={`Delete ${t.note}`} onClick={() => void remove(t)}><Trash2 size={17} /></button></div>)}</details>}
      <p className="mt-5 text-xs text-slate-500">Your personal ledger. Friends don't need an account.</p>
    </div>
    {(mode || settling) && <Sheet title={settling ? `Payment · ${settling.name}` : mode === "split" ? "Split a bill" : mode === "lent" ? "Lend money" : "Borrowed money"} onClose={close}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(); }}>
        <label className="field-label">{mode === "split" ? "Bill total" : "Amount"} ({currency})<input required autoFocus className="field amount-field" inputMode="decimal" type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
        {!settling && mode !== "split" && <label className="field-label">Person's name<input required className="field" maxLength={60} placeholder="e.g. Arbaz" value={person} onChange={e => setPerson(e.target.value)} /></label>}
        {mode === "split" && <>
          <p className="info-note">You paid the full bill. Only your share counts as your expense.</p>
          <label className="field-label">Friends (separate names with commas)<input required className="field" maxLength={400} value={names} onChange={e => setNames(e.target.value)} /></label>
          <div className="segmented"><button type="button" className={splitMode === "equal" ? "active" : ""} onClick={() => setSplitMode("equal")}>Equally</button><button type="button" className={splitMode === "custom" ? "active" : ""} onClick={() => setSplitMode("custom")}>Exact amounts</button></div>
          <div className="surface p-3 space-y-2">{shares.map((s, i) => <label key={i} className="flex items-center justify-between gap-3 text-sm"><span>{s.name}{s.isMe ? " (you)" : ""}</span>{splitMode === "equal" ? <strong>{fmt(s.amount)}</strong> : <input aria-label={`${s.name} share`} className="field !mt-0 !w-28" inputMode="decimal" type="number" min="0" step="0.01" value={custom[s.name] ?? ""} onChange={e => setCustom({ ...custom, [s.name]: e.target.value })} />}</label>)}</div>
          <label className="field-label">Category<select className="field" value={categoryId || categories.find(c => c.name === "Food")?.id || categories[0]?.id || ""} onChange={e => setCategoryId(e.target.value)}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        </>}
        <label className="field-label">Note<input className="field" maxLength={200} placeholder={mode === "split" ? "Dinner with the gang" : "Optional note"} value={note} onChange={e => setNote(e.target.value)} /></label>
        <PaymentFields value={finance} onChange={setFinance} />
        <label className="field-label">Date<input required type="date" className="field" value={date} onChange={e => setDate(e.target.value)} /></label>
        {!settling && <label className="field-label">Due date (optional)<input type="date" className="field" min={date} value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="primary-button w-full" disabled={busy || !ledger}>{busy ? "Saving…" : settling ? "Record payment" : mode === "split" ? "Save split" : "Save entry"}</button>
      </form>
    </Sheet>}
  </div>;
}
