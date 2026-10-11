import { expect, it } from "vitest";
import { personContacts } from "./contacts";
import type { Transaction, FinanceDetails } from "../db/types";
const tx = (id: string, amount: number, finance: FinanceDetails): Transaction => ({ id, amount, finance, note: id, categoryId: "", date: "2026-10-11", time: "12:00", createdAt: 1 });
it("groups both loan directions and only the person's split share", () => {
  const rows = [tx("lent", 500, { kind: "lent", paymentMethod: "upi", person: "Arbaz" }), tx("borrowed", 300, { kind: "borrowed", paymentMethod: "cash", person: " arbaz " }), tx("split", 1000, { kind: "split", paymentMethod: "credit", cardName: "SBI", shares: [{ id: "me", name: "Me", isMe: true, amount: 200 }, { id: "a", name: "ARBAZ", amount: 400 }, { id: "r", name: "Rini", amount: 400 }] })];
  const contact = personContacts(rows).find(c => c.key === "arbaz")!;
  expect(contact).toMatchObject({ lent: 500, borrowed: 300, split: 400, net: 600, receivable: 900, payable: 300 });
  expect(contact.entries).toHaveLength(3);
  rows.push(tx("received", 100, { kind: "settlement", paymentMethod: "upi", settlesId: "split", settlesShareId: "a", direction: "in", person: "Old name" }));
  rows.push(tx("paid", 50, { kind: "settlement", paymentMethod: "cash", settlesId: "borrowed", direction: "out" }));
  expect(personContacts(rows).find(c => c.key === "arbaz")).toMatchObject({ received: 100, paid: 50, net: 550 });
  expect(personContacts(rows).find(c => c.key === "rini")?.received).toBe(0);
});
it("retains settled contacts and follows corrected parent names for repayments", () => {
  const rows = [tx("loan", 100, { kind: "lent", paymentMethod: "upi", person: "Riya" }), tx("payment", 100, { kind: "settlement", paymentMethod: "upi", person: "Rini", settlesId: "loan", direction: "in" })];
  expect(personContacts(rows)).toHaveLength(1);
  expect(personContacts(rows)[0]).toMatchObject({ name: "Riya", net: 0, received: 100 });
  expect(personContacts(rows)[0].entries).toHaveLength(2);
});
