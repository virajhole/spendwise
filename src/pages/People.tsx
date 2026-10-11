import { useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus, Users, Check, Trash2, Pencil } from "lucide-react";
import PeopleContacts from "../components/PeopleContacts";
import Header from "../components/Header";
import Sheet from "../components/Sheet";
import PaymentFields from "../components/PaymentFields";
import { useLedger, useCategories, saveExpense, deleteExpense, updateExpense } from "../store/data";
import { useStore } from "../store/store";
import { balances, equalShares, mixedShares, money, validateFinance, validateLedgerWrite, type Balance } from "../utils/finance";
import { currentTime, todayISO, formatAmount } from "../utils/format";
import type { FinanceDetails, Transaction } from "../db/types";
import { pushToast } from "../store/toast";

export default function People() {
  const ledger = useLedger();
  const categories = useCategories();
  const { currency } = useStore();
  const [view, setView] = useState<"entries" | "contacts">("contacts");
  const [mode, setMode] = useState<"lent" | "borrowed" | "split" | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [direction, setDirection] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [settling, setSettling] = useState<Balance | null>(null);
  const [amount, setAmount] = useState("");
  const [person, setPerson] = useState("");
  const [editNames, setEditNames] = useState<string[] | null>(null);
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
  const participants = ["Me", ...(editNames ?? names.split(",").map(n => n.trim()).filter(Boolean))];
  let splitError = "";
  let shares = equalShares(Number(amount) || 0, participants);
  try {
    if (splitMode === "mixed") shares = mixedShares(Number(amount) || 0, participants, custom);
    else if (splitMode === "custom") shares = participants.map((name, i) => ({ id: String(i), name, isMe: i === 0, amount: Number(custom[name] || 0) }));
  } catch (e) { splitError = e instanceof Error ? e.message : "Check your shares"; }
  // Preserve repayment links when editing an existing split, including quick entries.
  shares = shares.map((share, index) => ({ ...share, id: editing?.finance?.shares?.[index]?.id ?? `new-${index}` }));
  const fmt = (n: number) => formatAmount(n, currency);
  const reset = () => { setEditNames(null); setEditing(null); setCategoryId(""); setAmount(""); setPerson(""); setNote(""); setError(""); setDate(todayISO()); setDueDate(""); setFinance({ kind: "lent", paymentMethod: "upi" }); setCustom({}); setSplitMode("equal"); };
  const open = (next: "lent" | "borrowed" | "split") => { reset(); setMode(next); if (next === "split") setCategoryId(categories.find(c => c.name === "Food")?.id ?? ""); };
  const close = () => { if (!busy) { setMode(null); setSettling(null); setEditing(null); setError(""); } };
  const edit = (t: Transaction) => {
    if (t.finance?.offset) { pushToast({ kind: "info", message: "Automatic adjustments keep both sides balanced and cannot be edited individually" }); return; }
    reset(); setEditing(t); setSettling(null);
    if (t.finance?.kind === "settlement") {
      setMode(null);
      setSettling(balances((ledger ?? []).filter(row => row.id !== t.id)).find(b => b.key === `${t.finance?.settlesId}:${t.finance?.settlesShareId ?? ""}`) ?? null);
    } else setMode(t.finance?.kind as "lent" | "borrowed" | "split");
    setAmount(String(t.amount)); setPerson(t.finance?.person ?? ""); setNote(t.note);
    setDate(t.date); setDueDate(t.finance?.dueDate ?? ""); setCategoryId(t.categoryId);
    setFinance({ ...t.finance! });
    if (t.finance?.kind === "split") {
      const ordered = [...(t.finance.shares ?? [])].sort((a, b) => Number(!!b.isMe) - Number(!!a.isMe));
      setEditing({ ...t, finance: { ...t.finance, shares: ordered } });
      setPerson(ordered.find(s => !s.isMe)?.name ?? "");
      setEditNames(ordered.filter(s => !s.isMe).map(s => s.name));
      setNames(ordered.filter(s => !s.isMe).map(s => s.name).join(", "));
      setCustom(Object.fromEntries(ordered.map(s => [s.name, String(s.amount)])));
      setSplitMode("custom");
    }
  };
  const save = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      let details: FinanceDetails = { ...finance, kind: mode ?? "settlement", dueDate: dueDate || undefined };
      if (settling) {
        const live = balances((ledger ?? []).filter(row => row.id !== editing?.id)).find(b => b.key === settling.key);
        if (!live || Number(amount) > live.remaining) throw new Error("Repayment cannot exceed the outstanding balance");
        if (date < live.transaction.date) throw new Error("Repayment date cannot be before the original entry");
        details = { ...finance, kind: "settlement", person: settling.name, settlesId: settling.transaction.id, settlesShareId: settling.shareId, direction: settling.direction };
      } else if (mode === "split") { if (splitError) throw new Error(splitError); details.shares = shares; delete details.person; }
      else { details.person = person.trim(); delete details.shares; }
      validateFinance(Number(amount), details);
      const entry = { amount: Number(amount), note: note.trim() || (settling ? `Repayment · ${settling.name}` : mode === "split" ? "Shared bill" : `Udhaar · ${person.trim()}`), categoryId, date, time: editing?.time ?? currentTime(), finance: details };
      if (editing) validateLedgerWrite({ ...editing, ...entry }, ledger ?? []);
      const saved = editing ? await updateExpense(editing.id, entry) : await saveExpense(entry);
      if (saved) { setMode(null); setSettling(null); setEditing(null); pushToast({ kind: "success", message: settling ? "Repayment recorded" : "Entry saved" }); }
      else setError("Couldn't save this entry. Please retry.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save"); }
    finally { lock.current = false; setBusy(false); }
  };
  const remove = async (t: Transaction) => {
    if (busy) return;
    setBusy(true);
    try { await deleteExpense(t.id); } finally { setBusy(false); }
  };
  const visible = all.filter(b => (direction === "all" || b.direction === direction) && (!fromDate || b.transaction.date >= fromDate) && (!toDate || b.transaction.date <= toDate) && (filter === "all" || (filter === "settled" ? b.remaining === 0 : b.remaining > 0))).sort((a, b) => b.transaction.date.localeCompare(a.transaction.date) || b.transaction.createdAt - a.transaction.createdAt);
  return <div className="page-layout"><Header />
    <div className="page-scroll">
      <div className="page-heading"><div><p className="eyebrow">MONEY & FRIENDS</p><h1>Keep it settled.</h1></div><div className="page-icon"><Users size={24} /></div></div>
      <p className="page-subtitle">Split the bill. Keep the friendship simple.</p>
      <div className="grid grid-cols-2 gap-3 my-5">
        <button type="button" aria-pressed={direction === "in"} onClick={() => { setView("entries"); setDirection("in"); setFilter("pending"); }} className={`metric-card mint text-left ${direction === "in" ? "ring-2 ring-teal-500" : ""}`}><ArrowDownLeft size={20} /><p>You'll get</p><strong>{ledger ? fmt(received) : "…"}</strong><span className="text-xs">View receivables →</span></button>
        <button type="button" aria-pressed={direction === "out"} onClick={() => { setView("entries"); setDirection("out"); setFilter("pending"); }} className={`metric-card text-left ${direction === "out" ? "ring-2 ring-teal-500" : ""}`}><ArrowUpRight size={20} /><p>You owe</p><strong>{ledger ? fmt(owed) : "…"}</strong><span className="text-xs">View payables →</span></button>
      </div>
      <div className="grid grid-cols-3 gap-2"><button className="action-tile" onClick={() => open("lent")}><ArrowUpRight size={20} />Lend money</button><button className="action-tile" onClick={() => open("borrowed")}><ArrowDownLeft size={20} />Borrowed</button><button className="action-tile" onClick={() => open("split")}><Plus size={20} />Split a bill</button></div>
      <div className="segmented mt-5" aria-label="People view"><button className={view === "entries" ? "active" : ""} aria-pressed={view === "entries"} onClick={() => setView("entries")}>Entries</button><button className={view === "contacts" ? "active" : ""} aria-pressed={view === "contacts"} onClick={() => setView("contacts")}>Contacts</button></div>
      {view === "contacts" ? (!ledger ? <p role="status">Loading contacts…</p> : <PeopleContacts ledger={ledger} categories={categories} currency={currency} onEdit={edit} onPayment={b => { reset(); setMode(null); setSettling(b); setAmount(String(b.remaining)); }} onAdd={(name, kind) => { open(kind); setPerson(name); if (kind === "split") setNames(name); }} />) : <>
      <div className="section-heading mt-7"><h2>{direction === "in" ? "People who owe you" : direction === "out" ? "People you owe" : "People & balances"}</h2><button className="small-button" onClick={() => { setDirection("all"); setFromDate(""); setToDate(""); setFilter("all"); }}>Show all</button></div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <label className="field-label min-w-0">From date<input aria-label="From date" className="field min-w-0" type="date" value={fromDate} max={toDate || undefined} onChange={e => setFromDate(e.target.value)} /></label>
        <label className="field-label min-w-0">To date<input aria-label="To date" className="field min-w-0" type="date" value={toDate} min={fromDate || undefined} onChange={e => setToDate(e.target.value)} /></label>
      </div>
      <p className="text-xs text-slate-500 mt-2">Filter by entry date · {visible.length} balances · Outstanding {fmt(visible.reduce((sum, b) => sum + b.remaining, 0))}</p>
      <div className="segmented my-3"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>Pending</button><button className={filter === "settled" ? "active" : ""} onClick={() => setFilter("settled")}>Settled</button></div>
      {!ledger ? <p role="status" className="empty-state">Loading your balances…</p> : !visible.length ? <div className="empty-state"><Check className="mx-auto mb-3 text-teal-600" /><strong>No matching balances</strong><p>Add an entry or adjust your filters.</p></div> :
        <div className="space-y-3">{visible.map(b => <article className="surface relative p-4" key={b.key}>
          <button type="button" className="absolute inset-0 rounded-[17px]" aria-label={`Edit ${b.name}`} onClick={() => edit(b.transaction)} />
          <div className="flex items-start gap-3"><span className="person-avatar">{b.name.slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><h3 className="font-semibold truncate">{b.name}</h3><p className="text-xs text-slate-500 truncate">{b.transaction.note} · {b.transaction.date}</p></div><div className="text-right shrink-0"><strong className={b.direction === "in" ? "text-teal-700 dark:text-teal-400" : "text-red-600 dark:text-red-400"}>{fmt(b.remaining)}</strong><p className="text-xs text-slate-500">{b.remaining === 0 ? "Settled" : b.direction === "in" ? "owes you" : "you owe"}</p></div></div>
          <p className="mt-2 text-[10px] text-slate-500 pointer-events-none">Tap to edit</p>
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500"><span>Original {fmt(b.original)} · Paid {fmt(money(b.original - b.remaining))}{b.transaction.finance?.dueDate ? ` · Due ${b.transaction.finance.dueDate}` : ""}</span>{b.remaining > 0 && <button className="small-button relative z-10" onClick={() => { reset(); setSettling(b); setAmount(String(b.remaining)); }}>Record payment</button>}</div>
        </article>)}</div>}
      {!!ledger?.some(t => t.finance && ["lent", "borrowed", "split", "settlement"].includes(t.finance.kind)) && <details className="surface mt-5 p-4"><summary className="cursor-pointer font-semibold text-sm">Entry & repayment history</summary><p className="mt-2 text-xs text-slate-500">Edit entries here. Recorded repayments stay linked; remove a mistaken repayment before reversing its direction.</p>{ledger.filter(t => t.finance && ["lent", "borrowed", "split", "settlement"].includes(t.finance.kind)).sort((a,b) => b.createdAt - a.createdAt).map(t => <div key={t.id} className="flex items-center gap-3 py-3 border-b border-slate-100 dark:border-slate-800"><div className="min-w-0 flex-1"><p className="text-sm truncate">{t.note}</p><p className="text-xs text-slate-500">{t.date} · {t.finance?.kind} · {fmt(t.amount)}</p></div><button className="icon-button" aria-label={`Edit ${t.note}`} onClick={() => edit(t)}><Pencil size={17} /></button><button disabled={busy || !!t.finance?.offset || ledger.some(s => s.finance?.settlesId === t.id)} className="icon-button text-red-500" aria-label={`Delete ${t.note}`} onClick={() => void remove(t)}><Trash2 size={17} /></button></div>)}</details>}
      </>}
      <p className="mt-5 text-xs text-slate-500">Your personal ledger. Friends don't need an account.</p>
    </div>
    {(mode || settling) && <Sheet title={editing ? "Edit entry" : settling ? `Payment · ${settling.name}` : mode === "split" ? "Split a bill" : mode === "lent" ? "Lend money" : "Borrowed money"} onClose={close}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(); }}>
        {!settling && <label className="field-label">Entry type<select className="field" value={mode ?? "lent"} onChange={e => setMode(e.target.value as "lent" | "borrowed" | "split")}><option value="lent">You'll get · Lene hain</option><option value="borrowed">You owe · Dene hain</option><option value="split">Shared bill · Split</option></select></label>}
        {settling && <p className="info-note">{settling.direction === "in" ? "Money received" : "Money paid"} · Outstanding {fmt(settling.remaining)}. Enter any partial amount or the full balance.</p>}
        <label className="field-label">{mode === "split" ? "Bill total" : "Amount"} ({currency})<input required autoFocus className="field amount-field" inputMode="decimal" type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
        {!settling && mode !== "split" && <label className="field-label">Person's name<input required className="field" maxLength={60} placeholder="e.g. Arbaz" list="existing-people" value={person} onChange={e => setPerson(e.target.value)} /></label>}
        <datalist id="existing-people">{[...new Set(all.map(b => b.name))].map(name => <option key={name} value={name} />)}</datalist>
        {mode === "split" && <>
          <p className="info-note">You paid the full bill. Only your share counts as your expense.</p>
          {!editing?.finance?.shares && <label className="field-label">Friends (separate names with commas)<input required className="field" maxLength={400} value={names} onChange={e => setNames(e.target.value)} /></label>}
          {!!editing?.finance?.shares && participants.slice(1).map((name, i) => <label key={i} className="field-label">Friend {i + 1}<input required className="field" aria-label={`Friend ${i + 1} name`} value={name} onChange={e => { const next = [...participants.slice(1)]; next[i] = e.target.value.replace(/,/g, ""); setEditNames(next); setCustom(previous => ({ ...previous, [e.target.value.replace(/,/g, "")]: previous[name] ?? "" })); }} /></label>)}
          <div className="segmented"><button type="button" className={splitMode === "equal" ? "active" : ""} onClick={() => setSplitMode("equal")}>Equally</button><button type="button" className={splitMode === "custom" ? "active" : ""} onClick={() => setSplitMode("custom")}>Exact amounts</button><button type="button" className={splitMode === "mixed" ? "active" : ""} onClick={() => setSplitMode("mixed")}>Fixed + rest</button></div>
          {splitMode === "mixed" && <p className="info-note">Enter fixed shares; leave the others blank (Auto) to divide the rest equally. Set Me to 0 if you did not eat.</p>}
          <div className="surface p-3 space-y-2">{shares.map((s, i) => <label key={i} className="flex items-center justify-between gap-3 text-sm"><span>{s.name}{s.isMe ? " (you)" : ""}</span>{splitMode === "equal" ? <strong>{fmt(s.amount)}</strong> : <input placeholder={splitMode === "mixed" ? `Auto ${fmt(s.amount)}` : "0"} aria-label={`${s.name} share`} className="field !mt-0 !w-28" inputMode="decimal" type="number" min="0" step="0.01" value={custom[s.name] ?? ""} onChange={e => setCustom({ ...custom, [s.name]: e.target.value })} />}</label>)}</div>
          {splitError && <p role="alert" className="text-sm text-red-600">{splitError}</p>}
        </>}
        {!settling && <label className="field-label">Category<select className="field" value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Uncategorized</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <label className="field-label">Note<input className="field" maxLength={200} placeholder={mode === "split" ? "Dinner with the gang" : "Optional note"} value={note} onChange={e => setNote(e.target.value)} /></label>
        <PaymentFields value={finance} onChange={setFinance} />
        <label className="field-label">Date<input required type="date" className="field" value={date} onChange={e => setDate(e.target.value)} /></label>
        {!settling && <label className="field-label">Due date (optional)<input type="date" className="field" min={date} value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="primary-button w-full" disabled={busy || !ledger}>{busy ? "Saving…" : editing ? "Save changes" : settling ? "Record payment" : mode === "split" ? "Save split" : "Save entry"}</button>
      </form>
    </Sheet>}
  </div>;
}
