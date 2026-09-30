import { describe, expect, it } from "vitest";
import {
  avgPerDay,
  budgetUsedPct,
  byCategory,
  dailySpend,
  dateGroupLabel,
  groupByDate,
  inMonth,
  monthLabel,
  projectedMonthEnd,
  remainingBalance,
  shiftMonth,
  totalExpense,
} from "./calc";

const tx = (amount: number, date: string) => ({ amount, date });

describe("totalExpense", () => {
  it("sums amounts", () => {
    expect(totalExpense([tx(100, "2026-09-01"), tx(250.5, "2026-09-02")])).toBe(350.5);
  });
  it("returns 0 for empty list", () => {
    expect(totalExpense([])).toBe(0);
  });
});

describe("remainingBalance", () => {
  it("subtracts total from budget", () => {
    expect(remainingBalance(1000, [tx(400, "2026-09-01")])).toBe(600);
  });
  it("goes negative when over budget", () => {
    expect(remainingBalance(100, [tx(150, "2026-09-01")])).toBe(-50);
  });
});

describe("budgetUsedPct", () => {
  it("computes percentage", () => {
    expect(budgetUsedPct(200, [tx(150, "2026-09-01")])).toBe(75);
  });
  it("can exceed 100", () => {
    expect(budgetUsedPct(100, [tx(250, "2026-09-01")])).toBe(250);
  });
  it("is 0 with no budget", () => {
    expect(budgetUsedPct(0, [tx(50, "2026-09-01")])).toBe(0);
  });
});

describe("month helpers", () => {
  it("filters by month", () => {
    const list = [tx(10, "2026-09-01"), tx(20, "2026-08-31"), tx(30, "2026-09-30")];
    expect(inMonth(list, "2026-09").map((t) => t.amount)).toEqual([10, 30]);
  });
  it("shifts months across year boundary", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(shiftMonth("2026-09", -1)).toBe("2026-08");
  });
  it("labels months", () => {
    expect(monthLabel("2026-09")).toBe("September 2026");
  });
});

describe("groupByDate", () => {
  const today = new Date(2026, 8, 30); // 30 Sep 2026
  it("labels Today and Yesterday", () => {
    const list = [
      { amount: 10, date: "2026-09-30" },
      { amount: 20, date: "2026-09-30" },
      { amount: 30, date: "2026-09-29" },
      { amount: 40, date: "2026-09-12" },
    ];
    const groups = groupByDate(list, today);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "12 Sept"]);
    expect(groups[0].items.length).toBe(2);
  });
  it("dateGroupLabel edge cases", () => {
    expect(dateGroupLabel("2026-09-30", "2026-09-30", "2026-09-29")).toBe("Today");
    expect(dateGroupLabel("2026-09-29", "2026-09-30", "2026-09-29")).toBe("Yesterday");
    expect(dateGroupLabel("2026-01-05", "2026-09-30", "2026-09-29")).toBe("5 Jan");
  });
});

describe("insights", () => {
  it("dailySpend maps into full month array", () => {
    const out = dailySpend([tx(100, "2026-09-03"), tx(50, "2026-09-03"), tx(20, "2026-09-01")], "2026-09");
    expect(out.length).toBe(30);
    expect(out[2].amount).toBe(150);
    expect(out[0].amount).toBe(20);
  });
  it("byCategory aggregates and sorts desc", () => {
    const list = [
      { ...tx(100, "2026-09-01"), categoryId: "food" },
      { ...tx(50, "2026-09-01"), categoryId: "travel" },
      { ...tx(25, "2026-09-02"), categoryId: "food" },
    ];
    expect(byCategory(list)).toEqual([
      { categoryId: "food", amount: 125 },
      { categoryId: "travel", amount: 50 },
    ]);
  });
  it("avgPerDay uses days elapsed in current month", () => {
    // Fixed date via known inputs: Sep has 30 days
    const out = avgPerDay([tx(300, "2026-02-10"), tx(100, "2026-02-20")], "2026-02");
    expect(out).toBe(14.29);
  });
  it("projectedMonthEnd extrapolates", () => {
    const p = projectedMonthEnd([tx(100, "2026-02-15")], "2026-02");
    expect(p).toBeCloseTo(100, 1);
  });
});
