import NetSettlementSheet from "./NetSettlementSheet";
import { useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { Category, Transaction } from "../db/types";
import { personContacts, contactKey } from "../utils/contacts";
import { PAYMENT_LABELS, type Balance } from "../utils/finance";
import { formatAmount } from "../utils/format";

export default function PeopleContacts({ ledger, categories, currency, onEdit, onPayment, onAdd }: {
  ledger: Transaction[]; categories: Category[]; currency: string;
  onEdit: (t: Transaction) => void; onPayment: (b: Balance) => void;
  onAdd: (name: string, kind: "lent" | "borrowed" | "split") => void;
}) {
  const contacts = useMemo(() => personContacts(ledger), [ledger]);
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get("contact"));
  const [settleOpen, setSettleOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const person = contacts.find(c => c.key === selected);
  const tone = (n: number) => n > 0 ? "text-teal-700 dark:text-teal-400" : n < 0 ? "text-red-600 dark:text-red-400" : "text-slate-500";
  const fmt = (n: number) => formatAmount(n, currency);
  if (!person) return <section aria-label="People contacts" className="mt-5">
    <h2 className="font-semibold">Your contacts</h2>
    <p className="text-xs text-slate-500 mt-1">Every person's loans, shared bills and payments together.</p>
    <input className="field mb-4" aria-label="Search contacts" placeholder="Search a name…" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="space-y-3">{contacts.filter(c => c.key.includes(contactKey(search))).map(c => <button key={c.key} className="surface w-full p-4 text-left flex items-center gap-3" onClick={() => { setSelected(c.key); setType("all"); setFrom(""); setTo(""); }} aria-label={`Open contact ${c.name}`}>
      <span className="person-avatar">{c.name[0].toUpperCase()}</span>
      <span className="min-w-0 flex-1"><span className="font-semibold block truncate">{c.name}</span><span className="text-xs text-slate-500">{c.entries.length} transactions · Tap for details</span></span>
      <span className="text-right"><strong className={`block ${tone(c.net)}`}>{fmt(Math.abs(c.net))}</strong><span className="text-xs text-slate-500">{c.net > 0 ? "Net you'll get" : c.net < 0 ? "Net you owe" : "Net balanced"}</span></span><ChevronRight size={15} className="shrink-0" />
    </button>)}</div>
    {!contacts.filter(c => c.key.includes(contactKey(search))).length && <p className="empty-state">No matching contacts. Add a loan or split to create one.</p>}
    <p className="text-xs text-slate-500 mt-4">Use the same name for the same person. Different spellings stay separate; tap an entry to correct its name.</p>
  </section>;
  const entries = person.entries.filter(e => (type === "all" || (e.transaction.finance?.kind === type && !e.transaction.finance?.offset)) && (!from || e.transaction.date >= from) && (!to || e.transaction.date <= to));
  return <section aria-label={`Contact ${person.name}`} className="mt-5 space-y-4">
    <button className="small-button inline-flex items-center gap-2" onClick={() => setSelected(null)}><ArrowLeft size={16} /> All contacts</button>
    <div className="flex items-center gap-3"><span className="person-avatar">{person.name[0].toUpperCase()}</span><h2 className="text-xl font-semibold break-words">{person.name}</h2></div>
    <div className="surface p-4"><p className="text-xs text-slate-500">Balance with you</p><strong className={`text-3xl ${tone(person.net)}`}>{fmt(Math.abs(person.net))}</strong><p className="text-sm">{person.net > 0 ? `${person.name} owes you` : person.net < 0 ? `You owe ${person.name}` : "Net balance is zero"}</p><p className="text-xs text-slate-500 mt-2">To receive {fmt(person.receivable)} · To pay {fmt(person.payable)}</p><p className="text-xs text-slate-500 mt-1">Settle up once for the net amount. Opposite balances adjust automatically.</p></div>
    {(person.receivable > 0 || person.payable > 0) && <button className="primary-button w-full" onClick={() => setSettleOpen(true)}>{person.net < 0 ? `Pay ${fmt(-person.net)}` : person.net > 0 ? `Receive ${fmt(person.net)}` : "Settle matching balances"}</button>}
    {settleOpen && <NetSettlementSheet person={person} ledger={ledger} currency={currency} onClose={() => setSettleOpen(false)} />}
    <details><summary className="text-xs text-slate-500 cursor-pointer">Balance breakdown</summary><dl className="grid grid-cols-2 gap-3 text-sm">{[["You lent", person.lent], ["You borrowed", person.borrowed], ["Their split shares", person.split], ["Repayments received", person.received], ["Repayments paid", person.paid]].map(([label, value]) => <div key={label} className="surface p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="font-semibold mt-1">{fmt(Number(value))}</dd></div>)}</dl></details>
    <div className="grid grid-cols-3 gap-2">{([['lent', 'Lend'], ['borrowed', 'Borrow'], ['split', 'Split bill']] as const).map(([kind, label]) => <button className="small-button" key={kind} onClick={() => onAdd(person.name, kind)}>{label}</button>)}</div>
    <div className="section-heading"><h3>History</h3><span>Tap an entry to edit</span></div>
    <div className="segmented"><button className={type === "all" ? "active" : ""} onClick={() => { setType("all"); setFrom(""); setTo(""); }}>All activity</button><button className={type === "settlement" ? "active" : ""} onClick={() => { setType("settlement"); setFrom(""); setTo(""); }}>Payments</button></div>
    <details><summary className="text-xs text-slate-500 cursor-pointer">Filter by date or type{from || to || !["all", "settlement"].includes(type) ? " · Active" : ""}</summary>
    <label className="field-label">Transaction type<select className="field" value={type} onChange={e => setType(e.target.value)}><option value="all">All transactions</option><option value="lent">Money lent</option><option value="borrowed">Money borrowed</option><option value="split">Split bills</option><option value="settlement">Repayments</option></select></label>
    <div className="grid grid-cols-2 gap-3"><label className="field-label min-w-0">From<input className="field" type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label><label className="field-label min-w-0">To<input className="field" type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label></div>
    </details>
    <p className="text-xs text-slate-500">{entries.length} matching transactions · Tap any entry to edit</p>
    {entries.map(({ transaction: t, amount, label, balance }) => <article key={`${t.id}:${balance?.shareId ?? ""}`} className="surface p-4 relative">
      {!t.finance?.offset && <button className="absolute inset-0 rounded-[17px]" aria-label={`Edit ${label} ${t.note}`} onClick={() => onEdit(t)} />}
      <div className="flex justify-between gap-3"><strong className="text-sm">{label}</strong><strong className={tone((balance?.direction ?? t.finance?.direction) === "in" ? amount : -amount)}>{fmt(amount)}</strong></div>
      <p className="text-sm mt-2 break-words">{t.note}</p><p className="text-xs text-slate-500 mt-1">{t.date} · {t.time} · {t.finance?.offset ? "Automatic adjustment · No money moved" : PAYMENT_LABELS[t.finance!.paymentMethod]}{t.finance?.cardName ? ` · ${t.finance.cardName}` : ""}</p>
      {t.categoryId && <p className="text-xs text-slate-500 mt-1">{categories.find(c => c.id === t.categoryId)?.name ?? "Uncategorized"}</p>}
      {t.finance?.kind === "split" && <p className="text-xs text-slate-500 mt-1">Full bill {fmt(t.amount)} · {t.finance.shares?.map(s => `${s.name}: ${fmt(s.amount)}`).join(" · ")}</p>}
      {t.finance?.dueDate && <p className="text-xs text-slate-500 mt-1">Due {t.finance.dueDate}</p>}
      {balance && <div className="mt-3 flex justify-between gap-2 items-center"><span className="text-xs text-slate-500">{balance.remaining === 0 ? "Fully paid" : `Remaining ${fmt(balance.remaining)}`}</span>{balance.remaining > 0 && <button className="small-button relative z-10" onClick={() => { setType("all"); setFrom(""); setTo(""); onPayment(balance); }}>Record payment</button>}</div>}
    </article>)}
    {!entries.length && <p className="empty-state">No transactions match these filters.</p>}
  </section>;
}
