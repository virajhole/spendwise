import { create } from "zustand";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Category, type Recurring, type Transaction } from "../db/db";
import { repo, uid } from "../db/repo";
import { shiftMonth, toISODate } from "../utils/calc";
import { currentTime, todayISO } from "../utils/format";

export type ThemeMode = "light" | "dark" | "system";

interface UIState {
  month: string; // "YYYY-MM" being viewed
  theme: ThemeMode;
  currency: string;
  editing: Transaction | null;
  collapsed: boolean;
  search: string;
  filterCategory: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  setMonth: (m: string) => void;
  setTheme: (t: ThemeMode) => void;
  setCurrency: (c: string) => void;
  setEditing: (t: Transaction | null) => void;
  toggleCollapsed: () => void;
  setSearch: (s: string) => void;
  setFilterCategory: (c: string | null) => void;
  setDateRange: (from: string | null, to: string | null) => void;
}

const themeKey = "spendwise.theme";
const currencyKey = "spendwise.currency";

export const useStore = create<UIState>((set) => ({
  month: todayISO().slice(0, 7),
  theme: "system",
  currency: "₹",
  editing: null,
  collapsed: false,
  search: "",
  filterCategory: null,
  dateFrom: null,
  dateTo: null,
  setMonth: (m) => set({ month: m }),
  setTheme: (t) => {
    set({ theme: t });
    void repo.setSetting(themeKey, t);
    applyTheme(t);
  },
  setCurrency: (c) => {
    set({ currency: c });
    void repo.setSetting(currencyKey, c);
  },
  setEditing: (t) => set({ editing: t }),
  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
  setSearch: (s) => set({ search: s }),
  setFilterCategory: (c) => set({ filterCategory: c }),
  setDateRange: (from, to) => set({ dateFrom: from, dateTo: to }),
}));

export function applyTheme(mode: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0f1115" : "#0ea5a4");
}

export async function initSettings() {
  // Writes must happen here (outside liveQuery) — Dexie liveQueries are read-only.
  await repo.ensureDefaults();
  const theme = await repo.getSetting<ThemeMode>(themeKey, "system");
  const currency = await repo.getSetting<string>(currencyKey, "₹");
  useStore.setState({ theme, currency });
  applyTheme(theme);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (useStore.getState().theme === "system") applyTheme("system");
  });
}

// ---- Data hooks (live queries over Dexie) ----

export function useTransactions(): Transaction[] | undefined {
  return useLiveQuery(() => db.transactions.toArray(), []);
}

export function useCategories(): Category[] {
  return useLiveQuery(() => db.categories.orderBy("name").toArray(), []) ?? [];
}

export function useBudget(month: string): number | undefined {
  return useLiveQuery(async () => {
    const row = await db.budgets.get(month);
    if (row) return row.amount;
    // default to last month's budget
    const prev = await db.budgets.get(shiftMonth(month, -1));
    return prev?.amount ?? undefined;
  }, [month]);
}

export function useRecurrings(): Recurring[] {
  return useLiveQuery(() => db.recurrings.toArray(), []) ?? [];
}

// ---- Mutations ----

export function makeTransaction(amount: number, note: string, categoryId: string, date: string, time: string, recurringId?: string): Transaction {
  return { id: uid(), amount, note, categoryId, date, time, createdAt: Date.now(), recurringId };
}

export async function saveExpense(input: {
  amount: number;
  note: string;
  categoryId: string;
  date: string;
  time: string;
}) {
  const tx = makeTransaction(input.amount, input.note, input.categoryId, input.date, input.time);
  await repo.addTransaction(tx);
  return tx;
}

export async function updateExpense(id: string, patch: Partial<Transaction>) {
  await repo.updateTransaction({ id, ...patch });
}

export async function deleteExpense(id: string): Promise<Transaction | undefined> {
  return repo.deleteTransaction(id);
}

export async function restoreExpense(t: Transaction) {
  await repo.addTransaction(t);
}
