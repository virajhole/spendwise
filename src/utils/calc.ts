/** Pure calculation & grouping logic — unit tested. */

export interface TxLike {
  amount: number;
  date: string; // "YYYY-MM-DD"
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Total of transaction amounts. */
export function totalExpense(txs: TxLike[]): number {
  return round2(txs.reduce((s, t) => s + t.amount, 0));
}

/** Remaining = budget - total (negative means over budget). */
export function remainingBalance(budget: number, txs: TxLike[]): number {
  return round2(budget - totalExpense(txs));
}

/** % of budget used (0-100+), 0 when no budget set. */
export function budgetUsedPct(budget: number, txs: TxLike[]): number {
  if (!budget || budget <= 0) return 0;
  return round2((totalExpense(txs) / budget) * 100);
}

/** Filter transactions belonging to a "YYYY-MM" month. */
export function inMonth(txs: TxLike[], month: string): TxLike[] {
  return txs.filter((t) => t.date.startsWith(month));
}

/** Shift a "YYYY-MM" month by delta months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "September 2026" style label. */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Sort newest first (by date, then createdAt/time). */
export function sortByNewest<T extends { date: string; createdAt?: number; time?: string }>(txs: T[]): T[] {
  return [...txs].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const at = a.createdAt ?? timeToMs(a.time ?? "00:00");
    const bt = b.createdAt ?? timeToMs(b.time ?? "00:00");
    return bt - at;
  });
}

function timeToMs(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 3600_000 + (m || 0) * 60_000;
}

export interface DateGroup<T> {
  label: string;
  date: string;
  items: T[];
}

/** Group sorted transactions by date with Today/Yesterday labels. */
export function groupByDate<T extends { date: string }>(txs: T[], today = new Date()): DateGroup<T>[] {
  const groups: DateGroup<T>[] = [];
  const todayStr = toISODate(today);
  const yesterdayStr = toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  for (const t of txs) {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) {
      last.items.push(t);
    } else {
      groups.push({ date: t.date, label: dateGroupLabel(t.date, todayStr, yesterdayStr), items: [t] });
    }
  }
  return groups;
}

export function dateGroupLabel(date: string, todayStr: string, yesterdayStr: string): string {
  if (date === todayStr) return "Today";
  if (date === yesterdayStr) return "Yesterday";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Per-day totals for bar chart within a month. */
export function dailySpend(txs: TxLike[], month: string): { day: number; amount: number }[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = Array.from({ length: days }, (_, i) => ({ day: i + 1, amount: 0 }));
  for (const t of inMonth(txs, month)) {
    const day = Number(t.date.slice(8, 10));
    if (day >= 1 && day <= days) out[day - 1].amount = round2(out[day - 1].amount + t.amount);
  }
  return out;
}

/** Category totals, sorted desc. */
export function byCategory(txs: (TxLike & { categoryId: string })[]): { categoryId: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const t of txs) map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
  return [...map.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);
}

export function avgPerDay(txs: TxLike[], month: string): number {
  const [y, m] = month.split("-").map(Number);
  const now = new Date();
  const isCurrent = now.getFullYear() === y && now.getMonth() + 1 === m;
  const days = isCurrent ? now.getDate() : new Date(y, m, 0).getDate();
  if (days === 0) return 0;
  return round2(totalExpense(inMonth(txs, month)) / days);
}

/** Projected month-end spend = avg/day × days in month. */
export function projectedMonthEnd(txs: TxLike[], month: string): number {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  return round2(avgPerDay(txs, month) * days);
}
