import { useRef, useState } from "react";
import { Pencil, Plus, Repeat2, Trash2 } from "lucide-react";
import Sheet from "./Sheet";
import { addRecurring, updateRecurring, deleteRecurring, useRecurrings, useCategories } from "../store/data";
import type { Recurring } from "../db/types";
import { useStore } from "../store/store";
import { formatAmount } from "../utils/format";
import { validateFinance } from "../utils/finance";
import { pushToast } from "../store/toast";

export default function RecurringExpenses() {
  const rows = useRecurrings();
  const categories = useCategories();
  const { currency } = useStore();
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("1");
  const [categoryId, setCategoryId] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const open = (r?: Recurring) => {
    setEditing(r ?? null); setName(r?.name ?? ""); setAmount(r ? String(r.amount) : "");
    setDay(String(r?.day ?? 1)); setCategoryId(r?.categoryId ?? categories[0]?.id ?? "");
    setActive(r?.active ?? true); setError(""); setOpened(true);
  };
  const save = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (!name.trim()) throw new Error("Enter a name");
      validateFinance(Number(amount));
      if (!Number.isInteger(Number(day)) || Number(day) < 1 || Number(day) > 28) throw new Error("Choose a day from 1 to 28");
      const patch = { name: name.trim(), amount: Number(amount), day: Number(day), categoryId, active };
      // Do not reset lastRun: editing a schedule must not charge this month twice.
      const saved = editing ? await updateRecurring(editing.id, patch) : await addRecurring(patch);
      if (saved) { setOpened(false); pushToast({ kind: "success", message: editing ? "Recurring expense updated" : "Recurring expense added" }); }
      else setError("Couldn't save. Please retry.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save"); }
    finally { lock.current = false; setBusy(false); }
  };
  return <>
    <div className="rounded-2xl bg-teal-50 p-3 mb-3 dark:bg-teal-950/30">
      <p className="text-xs text-slate-500">Active monthly total</p>
      <strong className="text-xl">{formatAmount(rows.filter(r => r.active).reduce((s, r) => s + r.amount, 0), currency)}</strong>
      <p className="text-xs text-slate-500 mt-1">{rows.filter(r => r.active).length} active schedules · Added when you open the app on or after the scheduled day.</p>
    </div>
    {!rows.length && <p className="text-sm text-slate-500 mb-3">Keep rent, subscriptions and monthly bills in one place.</p>}
    <ul className="space-y-3">{[...rows].sort((a, b) => a.day - b.day).map(r => <li key={r.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-start gap-2"><Repeat2 size={18} className="text-teal-600 mt-1 shrink-0" /><div className="min-w-0 flex-1"><p className="font-semibold break-words">{r.name}</p><p className="text-xs text-slate-500">Day {r.day} monthly · {categories.find(c => c.id === r.categoryId)?.name ?? "Uncategorized"}</p></div><strong className="text-sm shrink-0">{formatAmount(r.amount, currency)}</strong></div>
      <div className="flex items-center gap-2 mt-3">
        <button disabled={busy} className="small-button" aria-label={`Toggle ${r.name}`} onClick={async () => { setBusy(true); try { await updateRecurring(r.id, { active: !r.active }); } finally { setBusy(false); } }}>{r.active ? "Active · Pause" : "Paused · Resume"}</button>
        <button className="small-button ml-auto inline-flex items-center gap-2" aria-label={`Edit recurring ${r.name}`} onClick={() => open(r)}><Pencil size={15} /> Edit</button>
        <button disabled={busy} className="icon-button text-red-500" aria-label={`Delete ${r.name}`} onClick={async () => { setBusy(true); try { await deleteRecurring(r.id); } finally { setBusy(false); } }}><Trash2 size={16} /></button>
      </div>
    </li>)}</ul>
    <button className="primary-button w-full mt-3" onClick={() => open()}><Plus size={17} /> Add recurring expense</button>
    {opened && <Sheet title={editing ? "Edit recurring expense" : "Add recurring expense"} onClose={() => { if (!busy) setOpened(false); }}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(); }}>
        <label className="field-label">Recurring name<input autoFocus required maxLength={100} className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Monthly rent" /></label>
        <label className="field-label">Recurring amount ({currency})<input required type="number" inputMode="decimal" min="0.01" step="0.01" className="field" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label className="field-label">Category<select className="field" value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Uncategorized</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field-label">Day of month<input required type="number" min="1" max="28" step="1" className="field" value={day} onChange={e => setDay(e.target.value)} /></label>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active schedule</label>
        <p className="info-note">Changes apply to future entries. Expenses already added stay unchanged. Days 1–28 work in every month.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="primary-button w-full">{busy ? "Saving…" : editing ? "Save changes" : "Add schedule"}</button>
      </form>
    </Sheet>}
  </>;
}
