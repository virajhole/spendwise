import { uid, type FinanceDetails, type Transaction } from "../db/types";
import { balances, money, validateLedgerWrite } from "./finance";
import { contactKey } from "./contacts";

/** Offset matching debts, then apply the actual payment to the remaining side. */
export function netSettlement(rows: Transaction[], name: string, paid: number, date: string, time: string, payment: FinanceDetails): Transaction[] {
  const items = balances(rows).filter(b => contactKey(b.name) === contactKey(name) && b.remaining > 0).sort((a, b) => a.transaction.date.localeCompare(b.transaction.date) || a.key.localeCompare(b.key));
  const incoming = money(items.filter(b => b.direction === "in").reduce((s, b) => s + b.remaining, 0));
  const outgoing = money(items.filter(b => b.direction === "out").reduce((s, b) => s + b.remaining, 0));
  const net = money(incoming - outgoing);
  if (!items.length) throw new Error("This contact is already settled");
  if (!Number.isFinite(paid) || paid < 0 || paid > Math.abs(net) || money(paid) !== paid || (net !== 0 && paid === 0)) throw new Error("Enter a payment between 0.01 and the net balance");
  if (["credit", "unknown"].includes(payment.paymentMethod)) throw new Error("Choose UPI, cash, debit or bank transfer");
  if (items.some(b => b.transaction.date > date)) throw new Error("Payment date cannot be before the entries being settled");
  const offset = Math.min(incoming, outgoing);
  const group = uid();
  const result: Transaction[] = [];
  const remaining = new Map(items.map(b => [b.key, b.remaining]));
  const allocate = (direction: "in" | "out", total: number, adjustment: boolean) => {
    let left = total;
    for (const b of items.filter(b => b.direction === direction)) {
      const amount = Math.min(remaining.get(b.key)!, left);
      if (!amount) continue;
      result.push({ id: uid(), amount, date, time, createdAt: Date.now(), categoryId: "", note: adjustment ? `Balance adjustment · ${name}` : `Net payment · ${name}`, finance: { kind: "settlement", paymentMethod: adjustment ? "unknown" : payment.paymentMethod, person: name, direction, settlesId: b.transaction.id, settlesShareId: b.shareId, netGroupId: group, offset: adjustment } });
      remaining.set(b.key, money(remaining.get(b.key)! - amount));
      left = money(left - amount);
    }
  };
  allocate("in", offset, true);
  allocate("out", offset, true);
  allocate(net > 0 ? "in" : "out", paid, false);
  validateNetBatch(result, rows);
  return result;
}

export function validateNetBatch(txs: Transaction[], rows: Transaction[]) {
  if (!txs.length || new Set(txs.map(t => t.id)).size !== txs.length) throw new Error("Invalid settlement batch");
  const group = txs[0].finance?.netGroupId;
  if (!group || txs.some(t => t.finance?.kind !== "settlement" || t.finance.netGroupId !== group || contactKey(t.finance.person ?? "") !== contactKey(txs[0].finance?.person ?? ""))) throw new Error("Invalid contact settlement");
  const offset = (direction: string) => money(txs.filter(t => t.finance?.offset && t.finance.direction === direction).reduce((s, t) => s + t.amount, 0));
  if (offset("in") !== offset("out")) throw new Error("Balance adjustments must match on both sides");
  const next = rows.filter(r => !txs.some(t => t.id === r.id));
  for (const t of txs) {
    const existing = rows.find(r => r.id === t.id);
    if (existing && (existing.amount !== t.amount || JSON.stringify(existing.finance) !== JSON.stringify(t.finance))) throw new Error("Payment changed; refresh your contact");
    const parent = next.find(r => r.id === t.finance?.settlesId);
    const name = parent?.finance?.kind === "split" ? parent.finance.shares?.find(s => s.id === t.finance?.settlesShareId)?.name : parent?.finance?.person;
    if (contactKey(name ?? "") !== contactKey(t.finance?.person ?? "")) throw new Error("The contact changed. Reopen the payment and try again");
    validateLedgerWrite(t, next);
    next.push(t);
  }
}
