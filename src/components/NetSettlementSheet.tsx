import { useRef, useState } from "react";
import Sheet from "./Sheet";
import PaymentFields from "./PaymentFields";
import type { FinanceDetails, Transaction } from "../db/types";
import type { PersonContact } from "../utils/contacts";
import { netSettlement } from "../utils/netSettlement";
import { saveContactSettlement } from "../store/data";
import { currentTime, formatAmount, todayISO } from "../utils/format";
import { pushToast } from "../store/toast";

export default function NetSettlementSheet({ person, ledger, currency, onClose }: { person: PersonContact; ledger: Transaction[]; currency: string; onClose: () => void }) {
  const [amount, setAmount] = useState(String(Math.abs(person.net)));
  const [date, setDate] = useState(todayISO());
  const [payment, setPayment] = useState<FinanceDetails>({ kind: "settlement", paymentMethod: "upi" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const retry = useRef<Transaction[] | null>(null);
  const fmt = (n: number) => formatAmount(n, currency);
  const save = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      // Keep IDs on an uncertain network retry so the same payment is never added twice.
      const txs = retry.current ?? netSettlement(ledger, person.name, Number(amount), date, currentTime(), payment);
      retry.current = txs;
      await saveContactSettlement(txs);
      pushToast({ kind: "success", message: "Payment and balance adjustments recorded" });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save. Retry this payment."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Sheet title={`Settle up · ${person.name}`} onClose={() => { if (!busy) onClose(); }}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(); }}>
      <div className="surface p-4 text-sm space-y-2"><p>You owe <strong>{fmt(person.payable)}</strong></p><p>You'll get <strong>{fmt(person.receivable)}</strong></p><p>Automatic adjustment <strong>{fmt(Math.min(person.receivable, person.payable))}</strong></p><p className="font-semibold">{person.net < 0 ? "You pay" : person.net > 0 ? "You receive" : "No payment needed"}: {fmt(Math.abs(person.net))}</p></div>
      {person.net !== 0 && <><label className="field-label">{person.net < 0 ? "Amount paid" : "Amount received"}<input autoFocus required disabled={busy || !!retry.current} className="field amount-field" type="number" inputMode="decimal" step="0.01" min="0.01" max={Math.abs(person.net)} value={amount} onChange={e => setAmount(e.target.value)} /></label><p className="text-xs text-slate-500">Full balance is filled in. Enter less for a partial payment.</p><fieldset disabled={busy || !!retry.current}><PaymentFields value={payment} onChange={setPayment} repayment /></fieldset></>}
      <label className="field-label">Payment date<input required disabled={busy || !!retry.current} className="field" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <p className="info-note">This records a payment you already made or received. Matching debts are adjusted automatically; no money is transferred by the app.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error} {retry.current ? "Retry uses the same payment, without duplicates." : ""}</p>}
      <button disabled={busy} className="primary-button w-full">{busy ? "Saving…" : retry.current ? "Retry payment" : person.net === 0 ? "Settle matching balances" : "Done · Record payment"}</button>
    </form>
  </Sheet>;
}
