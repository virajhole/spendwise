import { useRef, useState } from "react";
import { ArrowUp, Plus, Sparkles } from "lucide-react";
import { useCategories, saveExpense, deleteExpense } from "../store/data";
import { useStore } from "../store/store";
import { pushToast } from "../store/toast";
import { currentTime, formatAmount, todayISO } from "../utils/format";
import { parseQuickEntry } from "../utils/quickEntry";
import { suggestCategoryName } from "../utils/calc";
import type { FinanceDetails } from "../db/types";
import Sheet from "./Sheet";
import PaymentFields from "./PaymentFields";

export default function QuickEntry() {
  const categories = useCategories();
  const currency = useStore(s => s.currency);
  const setMonth = useStore(s => s.setMonth);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState("");
  const manualCategory = useRef(false);
  const [finance, setFinance] = useState<FinanceDetails>({ kind: "expense", paymentMethod: "upi" });
  const save = async (detailed: boolean) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const input = detailed ? { amount: Number(amount), note: note.trim(), categoryId: categoryId || categories[0]?.id || "", finance } : parseQuickEntry(text, categories);
      const saved = await saveExpense({ ...input, date: detailed ? date : todayISO(), time: currentTime() });
      if (!saved) { setError("Entry wasn't saved. Check the amount and payment details, then try again."); return; }
      setMonth(saved.date.slice(0, 7));
      setText(""); setAmount(""); setNote(""); setCategoryId(""); manualCategory.current = false; setOpen(false);
      pushToast({ kind: "success", message: `${saved.finance?.kind === "lent" ? "Udhaar" : saved.note || "Expense"} · ${formatAmount(saved.amount, currency)} saved`, action: { label: "Undo", run: () => { void deleteExpense(saved.id); } } });
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save. Try again."); }
    finally { saving.current = false; setBusy(false); }
  };
  return <>
    <div className="quick-dock">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400"><Sparkles size={13} /> A little chat. All your expenses.</div>
      <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); void save(false); }}>
        <button className="icon-button shrink-0" type="button" aria-label="Add details" onClick={() => { setError(""); setOpen(true); }}><Plus size={22} /></button>
        <input className="min-w-0 flex-1 bg-transparent py-3 outline-none" aria-label="Quick expense" placeholder="Try ‘chai 15 upi’" maxLength={200} value={text} onChange={e => { setText(e.target.value); setError(""); }} />
        <button className="send-button" aria-label="Send expense" disabled={busy || !text.trim()}><ArrowUp size={21} /></button>
      </form>
      {error && !open && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
    {open && <Sheet title="Add an expense" onClose={() => { if (!busy) setOpen(false); }}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(true); }}>
        <label className="field-label">Amount ({currency})<input autoFocus required type="number" min="0.01" step="0.01" inputMode="decimal" className="field amount-field" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
        <label className="field-label">What was it for?<input className="field" maxLength={200} value={note} onChange={e => { setNote(e.target.value); if (!manualCategory.current) { const suggested = suggestCategoryName(e.target.value); setCategoryId(categories.find(c => c.name === suggested)?.id ?? categories.find(c => c.name === "Other")?.id ?? ""); } }} placeholder="Coffee, groceries, a little treat…" /></label>
        <label className="field-label">Category<select className="field" value={categoryId || categories[0]?.id || ""} onChange={e => { setCategoryId(e.target.value); manualCategory.current = true; }}>{categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></label>
        <PaymentFields value={finance} onChange={setFinance} />
        <label className="field-label">Date<input required type="date" className="field" value={date} onChange={e => setDate(e.target.value)} /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="primary-button w-full" disabled={busy || !categories.length}>{busy ? "Saving…" : "Save expense"}</button>
      </form>
    </Sheet>}
  </>;
}
