import { describe, expect, it } from "vitest";
import { suggestCategoryName } from "./calc";
import { EMPTY_FILTERS, filterTransactions, hasActiveFilters } from "./filters";
import type { Transaction } from "../db/types";

const tx = (over: Partial<Transaction>): Transaction => ({
  id: over.id ?? "x",
  amount: 10,
  note: over.note ?? "",
  categoryId: "food",
  date: "2026-10-02",
  time: "10:00",
  createdAt: 1,
  ...over,
});

describe("suggestCategoryName", () => {
  it("maps common words to category names", () => {
    expect(suggestCategoryName("tea")).toBe("Food");
    expect(suggestCategoryName("Rapido to office")).toBe("Travel");
    expect(suggestCategoryName("Electricity bill")).toBe("Bills");
    expect(suggestCategoryName("Netflix")).toBe("Fun");
    expect(suggestCategoryName("medicines")).toBe("Health");
    expect(suggestCategoryName("t-shirt from amazon")).toBe("Shopping");
  });

  it("returns null for unknown notes and empty input", () => {
    expect(suggestCategoryName("something weird")).toBeNull();
    expect(suggestCategoryName("")).toBeNull();
  });

  it("prefers the category with the most keyword hits", () => {
    // "grocery mall" is itself a Shopping hint (2 hits: "grocery mall" + "mall")
    expect(suggestCategoryName("grocery mall")).toBe("Shopping");
  });
});

describe("filterTransactions", () => {
  const txs = [
    tx({ id: "1", note: "Tea", amount: 15, categoryId: "food", date: "2026-10-01" }),
    tx({ id: "2", note: "Rapido", amount: 28, categoryId: "travel", date: "2026-10-02" }),
    tx({ id: "3", note: "Netflix", amount: 500, categoryId: "fun", date: "2026-10-03" }),
  ];

  it("filters by search text (case-insensitive)", () => {
    const r = filterTransactions(txs, { ...EMPTY_FILTERS, search: "rap" });
    expect(r.map((t) => t.id)).toEqual(["2"]);
  });

  it("filters by category, date range and amount range", () => {
    expect(filterTransactions(txs, { ...EMPTY_FILTERS, filterCategory: "food" }).map((t) => t.id)).toEqual(["1"]);
    expect(filterTransactions(txs, { ...EMPTY_FILTERS, dateFrom: "2026-10-02" }).map((t) => t.id)).toEqual(["2", "3"]);
    expect(filterTransactions(txs, { ...EMPTY_FILTERS, dateTo: "2026-10-02" }).map((t) => t.id)).toEqual(["1", "2"]);
    expect(filterTransactions(txs, { ...EMPTY_FILTERS, minAmount: 20 }).map((t) => t.id)).toEqual(["2", "3"]);
    expect(filterTransactions(txs, { ...EMPTY_FILTERS, maxAmount: 100 }).map((t) => t.id)).toEqual(["1", "2"]);
  });

  it("combines filters and reports active state", () => {
    const f = { ...EMPTY_FILTERS, search: "a", minAmount: 5 };
    const r = filterTransactions(txs, f);
    // notes containing "a" above ₹5: Tea (15), Rapido (28) — Netflix has no "a"
    expect(r.map((t) => t.id)).toEqual(["1", "2"]);
    expect(hasActiveFilters(f)).toBe(true);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });
});
