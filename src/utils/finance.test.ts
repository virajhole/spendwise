import { describe, it, expect } from "vitest";
import { balances, cardBalances, equalShares, mixedShares, paymentTotals, personalAmount, validateFinance, validateLedgerWrite } from "./finance";
import { totalExpense, byCategory, dailySpend } from "./calc";
import { parseQuickEntry } from "./quickEntry";
import { DEFAULT_CATEGORIES, expenseToRow, rowToExpense, type Transaction, type ExpenseRow } from "../db/types";
import { createDexieRepository } from "../db/dexieRepo";

const tx = (id: string, amount: number, finance?: Transaction["finance"]): Transaction => ({ id, amount, finance, categoryId: "food", date: "2026-10-11", time: "12:00", note: "Dinner", createdAt: 1 });
describe("personal ledger accounting", () => {
  const split = tx("bill", 1000, { kind: "split", paymentMethod: "credit", cardName: "HDFC", shares: equalShares(1000, ["Me", "Arbaz", "Rini", "Tisbhina", "Kishon"]) });
  it("counts only my share, keeps the full card charge and ignores repayments in expenses", () => {
    const paid = tx("card-payment", 400, { kind: "card_payment", paymentMethod: "upi", cardName: "hdfc" });
    const rows = [split, paid, tx("loan", 500, { kind: "lent", paymentMethod: "cash", person: "Arbaz" })];
    expect(totalExpense(rows)).toBe(200);
    expect(paymentTotals(rows).credit).toBe(1000);
    expect(paymentTotals(rows).upi).toBe(0);
    expect(cardBalances(rows)[0].outstanding).toBe(600);
    expect(byCategory(rows)[0].amount).toBe(200);
    expect(dailySpend(rows, "2026-10")[10].amount).toBe(200);
  });
  it("applies partial repayments to exactly one participant across months", () => {
    const paid = tx("settled", 75, { kind: "settlement", paymentMethod: "upi", settlesId: "bill", settlesShareId: "1", direction: "in" });
    paid.date = "2026-11-01";
    const rows = balances([split, paid]);
    expect(rows.find(b => b.name === "Arbaz")?.remaining).toBe(125);
    expect(rows.find(b => b.name === "Rini")?.remaining).toBe(200);
  });
  it("preserves every paise when an equal split is not divisible", () => {
    const shares = equalShares(100, ["Me", "A", "B"]);
    expect(shares.map(s => s.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(() => validateFinance(100, { kind: "split", paymentMethod: "cash", shares })).not.toThrow();
    expect(() => validateFinance(101, { kind: "split", paymentMethod: "cash", shares })).toThrow(/add up/);
  });
  it("validates duplicate names, card names and invalid amounts", () => {
    expect(() => validateFinance(10, { kind: "expense", paymentMethod: "credit" })).toThrow(/card name/);
    expect(() => validateFinance(10.123)).toThrow(/decimal/);
    expect(() => validateFinance(10, { kind: "split", paymentMethod: "cash", shares: equalShares(10, ["Me", "A", "a"]) })).toThrow(/unique/);
  });
  it("preserves old expenses and metadata through the cloud row mapper", () => {
    expect(personalAmount(tx("old", 50))).toBe(50);
    expect(paymentTotals([tx("old", 50)]).unknown).toBe(50);
    expect(rowToExpense(expenseToRow(split) as ExpenseRow).finance).toEqual(split.finance);
  });
  it("rejects invalid repayments while allowing safe edits to repaid bills", () => {
    const repayment = tx("r", 201, { kind: "settlement", paymentMethod: "upi", settlesId: "bill", settlesShareId: "1", direction: "in" });
    expect(() => validateLedgerWrite(repayment, [split])).toThrow(/exceeds/);
    expect(() => validateLedgerWrite(repayment, [])).toThrow(/not found/);
    repayment.amount = 100;
    expect(() => validateLedgerWrite(repayment, [split])).not.toThrow();
    expect(() => validateLedgerWrite({ ...split, amount: 2000, finance: { ...split.finance!, shares: equalShares(2000, ["Me", "Arbaz", "Rini", "Tisbhina", "Kishon"]) } }, [split, repayment])).not.toThrow();
    expect(() => validateLedgerWrite({ ...split, amount: 100, finance: { ...split.finance!, shares: equalShares(100, ["Me", "Arbaz", "Rini", "Tisbhina", "Kishon"]) } }, [split, repayment])).toThrow(/less than/);
  });
  it("splits only the remainder and rejects over-allocation", () => {
    expect(mixedShares(1000, ["Me", "Viraj", "Kishon", "Rini"], { Viraj: "200", Kishon: "200" }).map(s => s.amount)).toEqual([300, 200, 200, 300]);
    expect(mixedShares(1000, ["Me", "Viraj", "Kishon", "Rini"], { Me: "0", Viraj: "200", Kishon: "200" }).map(s => s.amount)).toEqual([0, 200, 200, 600]);
    expect(mixedShares(1, ["Me", "A", "B"], {}).map(s => s.amount)).toEqual([0.34, 0.33, 0.33]);
    expect(() => mixedShares(100, ["Me", "A"], { A: "101" })).toThrow(/exceed/);
    expect(() => mixedShares(100, ["Me", "A"], { Me: "0", A: "99" })).toThrow(/Auto/);
    expect(() => mixedShares(100, ["Me", "A"], { A: "1.001" })).toThrow(/decimals/);
  });
  it("preserves repayment balances when editing name and amount, but guards direction", () => {
    const loan = tx("loan", 300, { kind: "lent", paymentMethod: "upi", person: "Rini" });
    const payment = tx("payment", 100, { kind: "settlement", paymentMethod: "upi", settlesId: "loan", direction: "in" });
    const edited = { ...loan, amount: 400, finance: { ...loan.finance!, person: "Riya" } };
    expect(() => validateLedgerWrite(edited, [loan, payment])).not.toThrow();
    expect(balances([edited, payment])[0]).toMatchObject({ name: "Riya", remaining: 300 });
    expect(() => validateLedgerWrite({ ...edited, finance: { ...edited.finance, kind: "borrowed" } }, [loan, payment])).toThrow(/direction/);
  });
  it("persists and validates repayments atomically in the local repository", async () => {
    const repo = createDexieRepository();
    await repo.clearAll();
    await repo.addExpense(split);
    const repayment = tx("r", 75, { kind: "settlement", paymentMethod: "upi", settlesId: "bill", settlesShareId: "1", direction: "in" });
    await repo.addExpense(repayment);
    await expect(repo.addExpense({ ...repayment, id: "overpayment", amount: 150 })).rejects.toThrow(/exceeds/);
    expect(balances(await repo.getAllExpenses()).find(b => b.name === "Arbaz")?.remaining).toBe(125);
    await repo.deleteExpense(split.id);
    expect(await repo.getAllExpenses()).toHaveLength(0);
  });
});
describe("quick expense entry", () => {
  it("understands chai, defaults to UPI and recognizes Hinglish udhaar and credit card splits", () => {
    expect(parseQuickEntry("chai 15rs", DEFAULT_CATEGORIES).amount).toBe(15);
    expect(parseQuickEntry("auto 80.50 upi", DEFAULT_CATEGORIES).finance.paymentMethod).toBe("upi");
    expect(parseQuickEntry("chai 15", DEFAULT_CATEGORIES).finance.paymentMethod).toBe("upi");
    expect(parseQuickEntry("Arbaz ko 500 diye udhaar", DEFAULT_CATEGORIES).finance).toMatchObject({ kind: "lent", person: "Arbaz" });
    expect(parseQuickEntry("maine rini ko 400 diye udhhar", DEFAULT_CATEGORIES).finance).toMatchObject({ kind: "lent", person: "rini" });
    expect(parseQuickEntry("rini take 300 dinner bill", DEFAULT_CATEGORIES)).toMatchObject({ amount: 300, note: "dinner", categoryId: DEFAULT_CATEGORIES.find(c => c.name === "Food")?.id, finance: { kind: "split", paymentMethod: "upi", shares: [{ name: "Me", amount: 0, isMe: true }, { name: "rini", amount: 300 }] } });
    expect(parseQuickEntry("rini take 300 dinner add in cc sbi", DEFAULT_CATEGORIES)).toMatchObject({ amount: 300, note: "dinner", finance: { kind: "split", paymentMethod: "credit", cardName: "SBI", shares: [{ name: "Me", amount: 0, isMe: true }, { name: "rini", amount: 300 }] } });
    expect(parseQuickEntry("rini take 300 dinner sbi cc", DEFAULT_CATEGORIES).finance).toMatchObject({ paymentMethod: "credit", cardName: "SBI" });
    expect(parseQuickEntry("Burger King 173 rs credit card SBI se", DEFAULT_CATEGORIES)).toMatchObject({ amount: 173, note: "Burger King", finance: { kind: "expense", paymentMethod: "credit", cardName: "SBI" } });
  });
  it("distinguishes money I owe from money lent or paid for a friend", () => {
    for (const phrase of ["mujhe Rini ko 299 dene hain", "Rini ko 299 dena hai", "I owe Rini 299"]) {
      expect(parseQuickEntry(phrase, DEFAULT_CATEGORIES)).toMatchObject({ amount: 299, finance: { kind: "borrowed", person: "Rini", paymentMethod: "upi" } });
    }
    expect(parseQuickEntry("maine Aakash ko 400 diye udhhar", DEFAULT_CATEGORIES).finance).toMatchObject({ kind: "lent", person: "Aakash" });
  });
  it("does not silently save ambiguous entries", () => {
    for (const input of ["chai 15 20", "chai -15", "chai", "something 50", "Arbaz 500 wapas", "shopping 500 card", "shopping 500 credit card"]) expect(() => parseQuickEntry(input, DEFAULT_CATEGORIES)).toThrow();
  });
});
