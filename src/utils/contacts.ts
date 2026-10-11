import type { Transaction } from "../db/types";
import { balances, money, type Balance } from "./finance";

export const contactKey = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
export interface ContactEntry { transaction: Transaction; amount: number; label: string; balance?: Balance }
export interface PersonContact {
  key: string; name: string; lent: number; borrowed: number; split: number;
  received: number; paid: number; receivable: number; payable: number; net: number;
  entries: ContactEntry[];
}

/** Payments belong to the current parent/share name, even after that name is edited. */
export function personContacts(rows: Transaction[]): PersonContact[] {
  const contacts = new Map<string, PersonContact>();
  const owners = new Map<string, PersonContact>();
  for (const balance of balances(rows)) {
    const key = contactKey(balance.name);
    const contact = contacts.get(key) ?? { key, name: balance.name.trim().replace(/\s+/g, " "), lent: 0, borrowed: 0, split: 0, received: 0, paid: 0, receivable: 0, payable: 0, net: 0, entries: [] };
    const kind = balance.transaction.finance!.kind;
    if (kind === "lent") contact.lent = money(contact.lent + balance.original);
    if (kind === "borrowed") contact.borrowed = money(contact.borrowed + balance.original);
    if (kind === "split") contact.split = money(contact.split + balance.original);
    if (balance.direction === "in") contact.receivable = money(contact.receivable + balance.remaining);
    else contact.payable = money(contact.payable + balance.remaining);
    contact.entries.push({ transaction: balance.transaction, amount: balance.original, label: kind === "lent" ? "You lent" : kind === "borrowed" ? "You borrowed" : "Their split share", balance });
    contacts.set(key, contact);
    owners.set(balance.key, contact);
  }
  for (const transaction of rows) {
    const f = transaction.finance;
    if (f?.kind !== "settlement") continue;
    const contact = owners.get(`${f.settlesId}:${f.settlesShareId ?? ""}`);
    if (!contact) continue;
    if (!f.offset) {
      if (f.direction === "in") contact.received = money(contact.received + transaction.amount);
      else contact.paid = money(contact.paid + transaction.amount);
    }
    contact.entries.push({ transaction, amount: transaction.amount, label: f.offset ? (f.direction === "in" ? "Adjusted receivable" : "Adjusted payable") : f.direction === "in" ? "Repayment received" : "Repayment paid" });
  }
  return [...contacts.values()].map(contact => ({ ...contact, net: money(contact.receivable - contact.payable), entries: contact.entries.sort((a, b) => b.transaction.date.localeCompare(a.transaction.date) || b.transaction.createdAt - a.transaction.createdAt) })).sort((a, b) => a.name.localeCompare(b.name));
}
