import { expect, it } from "vitest";
import { netSettlement } from "./netSettlement";
import { balances } from "./finance";
import { personContacts } from "./contacts";
import { createDexieRepository } from "../db/dexieRepo";
import type { Transaction } from "../db/types";
const rows: Transaction[] = [
  { id: "borrow", amount: 1000, categoryId: "", note: "Loan", date: "2026-10-01", time: "10:00", createdAt: 1, finance: { kind: "borrowed", paymentMethod: "upi", person: "Rini" } },
  { id: "split", amount: 400, categoryId: "", note: "Dinner", date: "2026-10-02", time: "10:00", createdAt: 2, finance: { kind: "split", paymentMethod: "upi", shares: [{ id: "me", name: "Me", isMe: true, amount: 200 }, { id: "rini", name: "rini", amount: 200 }] } },
];
const build = (paid: number, input = rows) => netSettlement(input, "Rini", paid, "2026-10-11", "12:00", { kind: "settlement", paymentMethod: "upi" });
it("nets 1000 borrowed against 200 split and records only 800 actual payment", () => {
  const batch = build(800);
  expect(batch.filter(t => !t.finance?.offset).map(t => t.amount)).toEqual([800]);
  expect(batch.filter(t => t.finance?.offset).map(t => t.amount)).toEqual([200, 200]);
  expect(balances([...rows, ...batch]).every(b => b.remaining === 0)).toBe(true);
  expect(personContacts([...rows, ...batch])[0]).toMatchObject({ net: 0, paid: 800, received: 0 });
});
it("supports partial payments then settles the remainder", () => {
  const partial = [...rows, ...build(300)];
  expect(personContacts(partial)[0]).toMatchObject({ net: -500, paid: 300, receivable: 0, payable: 500 });
  expect(build(500, partial).filter(t => t.finance?.offset)).toHaveLength(0);
  expect(() => build(801)).toThrow(/net balance/);
  expect(() => build(0)).toThrow();
});
it("handles incoming and zero-cash settlements", () => {
  const zero = [{ ...rows[0], amount: 200 }, rows[1]];
  const batch = build(0, zero);
  expect(batch.every(t => t.finance?.offset)).toBe(true);
  expect(personContacts([...zero, ...batch])[0]).toMatchObject({ net: 0, paid: 0, received: 0 });
  const incoming = [{ ...rows[0], amount: 100 }, rows[1]];
  expect(personContacts([...incoming, ...build(100, incoming)])[0]).toMatchObject({ net: 0, paid: 0, received: 100 });
});
it("saves atomically, rejects stale allocations, and retries without duplicates", async () => {
  const repo = createDexieRepository();
  await repo.clearAll();
  for (const row of rows) await repo.addExpense(row);
  const batch = build(800);
  const broken = batch.map(t => t.finance?.offset ? t : { ...t, amount: 900 });
  await expect(repo.settleContact(broken)).rejects.toThrow(/exceeds/);
  expect(await repo.getAllExpenses()).toHaveLength(2);
  await repo.settleContact(batch);
  await repo.settleContact(batch);
  expect(await repo.getAllExpenses()).toHaveLength(5);
  expect(personContacts(await repo.getAllExpenses())[0].net).toBe(0);
});
