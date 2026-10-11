import type { FinanceDetails, PaymentMethod, SplitShare, Transaction } from "../db/types";
import { MAX_AMOUNT } from "../db/types";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI", cash: "Cash", debit: "Debit card", credit: "Credit card", bank: "Bank transfer", unknown: "Not recorded",
};
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function personalAmount(t: { amount: number; finance?: FinanceDetails }): number {
  if (!t.finance || t.finance.kind === "expense") return t.amount;
  if (t.finance.kind === "split") return money((t.finance.shares ?? []).filter(s => s.isMe).reduce((sum, s) => sum + s.amount, 0));
  return 0;
}
export function isSpending(t: Transaction): boolean { return !t.finance || ["expense", "split"].includes(t.finance.kind); }

export function equalShares(amount: number, names: string[]): SplitShare[] {
  if (!names.length) throw new Error("Add at least one person");
  const cents = Math.round(amount * 100);
  return names.map((name, i) => ({ id: String(i), name: name.trim(), isMe: i === 0, amount: (Math.floor(cents / names.length) + (i < cents % names.length ? 1 : 0)) / 100 }));
}

export function validateFinance(amount: number, f?: FinanceDetails): void {
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.001) throw new Error("Enter a valid amount with at most 2 decimal places");
  if (!f) return;
  if (!(f.paymentMethod in PAYMENT_LABELS)) throw new Error("Choose a payment method");
  if (!["expense", "lent", "borrowed", "split", "settlement", "card_payment"].includes(f.kind)) throw new Error("Invalid entry type");
  if ((f.paymentMethod === "credit" || f.kind === "card_payment") && !f.cardName?.trim()) throw new Error("Enter a card name");
  if (["lent", "borrowed"].includes(f.kind) && !f.person?.trim()) throw new Error("Enter a person's name");
  if (f.kind === "split") {
    const shares = f.shares ?? [];
    if (shares.length < 2 || shares.filter(s => s.isMe).length !== 1) throw new Error("Include yourself and at least one friend");
    if (shares.some(s => !s.name.trim() || !Number.isFinite(s.amount) || s.amount < 0 || Math.abs(s.amount * 100 - Math.round(s.amount * 100)) > 0.001)) throw new Error("Check the names and share amounts");
    if (new Set(shares.map(s => s.id)).size !== shares.length || new Set(shares.map(s => s.name.trim().toLowerCase())).size !== shares.length) throw new Error("Each participant needs a unique name");
    if (Math.round(shares.reduce((sum, s) => sum + s.amount, 0) * 100) !== Math.round(amount * 100)) throw new Error("Shares must add up to the bill total");
  }
  if (f.kind === "settlement" && (!f.settlesId || !["in", "out"].includes(f.direction ?? ""))) throw new Error("Choose the balance to settle");
  if (f.kind === "card_payment" && ["credit", "unknown"].includes(f.paymentMethod)) throw new Error("Choose how you paid the card bill");
}

export interface Balance { key: string; transaction: Transaction; shareId?: string; name: string; original: number; remaining: number; direction: "in" | "out" }
export function balances(txs: Transaction[]): Balance[] {
  const repayments = new Map<string, number>();
  for (const t of txs) {
    if (t.finance?.kind !== "settlement") continue;
    const key = `${t.finance.settlesId}:${t.finance.settlesShareId ?? ""}`;
    repayments.set(key, money((repayments.get(key) ?? 0) + t.amount));
  }
  const result: Balance[] = [];
  const add = (t: Transaction, name: string, original: number, direction: "in" | "out", shareId?: string) => {
    const key = `${t.id}:${shareId ?? ""}`;
    result.push({ key, transaction: t, shareId, name, original, remaining: money(Math.max(0, original - (repayments.get(key) ?? 0))), direction });
  };
  for (const t of txs) {
    if (t.finance?.kind === "lent") add(t, t.finance.person!, t.amount, "in");
    if (t.finance?.kind === "borrowed") add(t, t.finance.person!, t.amount, "out");
    if (t.finance?.kind === "split") for (const s of t.finance.shares ?? []) if (!s.isMe && s.amount > 0) add(t, s.name, s.amount, "in", s.id);
  }
  return result;
}

/** Local repository mirrors the database's ledger invariants inside a transaction. */
export function validateLedgerWrite(t: Transaction, rows: Transaction[]): void {
  validateFinance(t.amount, t.finance);
  const previous = rows.find(r => r.id === t.id);
  if (previous && rows.some(r => r.finance?.settlesId === t.id) && (previous.amount !== t.amount || JSON.stringify(previous.finance) !== JSON.stringify(t.finance))) throw new Error("Remove repayments before changing this entry");
  if (t.finance?.kind !== "settlement") return;
  const f = t.finance;
  const target = balances(rows.filter(r => r.id !== t.id)).find(b => b.key === `${f.settlesId}:${f.settlesShareId ?? ""}`);
  if (!target || f.settlesId === t.id) throw new Error("Original entry not found");
  if (f.direction !== target.direction || t.amount > target.remaining) throw new Error("Repayment exceeds the outstanding balance or has the wrong direction");
}

/** Gross purchases by payment method; repayments and loans are separate movements. */
export function paymentTotals(txs: Transaction[]): Record<PaymentMethod, number> {
  const result = Object.fromEntries(Object.keys(PAYMENT_LABELS).map(k => [k, 0])) as Record<PaymentMethod, number>;
  for (const t of txs.filter(isSpending)) {
    const method = t.finance?.paymentMethod ?? "unknown";
    result[method] = money(result[method] + t.amount);
  }
  return result;
}
export function cardBalances(txs: Transaction[]): { name: string; spent: number; paid: number; outstanding: number }[] {
  const cards = new Map<string, { name: string; spent: number; paid: number; outstanding: number }>();
  for (const t of txs) {
    const f = t.finance;
    if (!f || (f.paymentMethod !== "credit" && f.kind !== "card_payment")) continue;
    const name = f.cardName?.trim() || "Credit card";
    const key = name.toLowerCase();
    const card = cards.get(key) ?? { name, spent: 0, paid: 0, outstanding: 0 };
    if (f.kind === "card_payment") card.paid = money(card.paid + t.amount);
    else if (f.kind !== "borrowed" && !(f.kind === "settlement" && f.direction === "in")) card.spent = money(card.spent + t.amount);
    card.outstanding = money(card.spent - card.paid);
    cards.set(key, card);
  }
  return [...cards.values()];
}
