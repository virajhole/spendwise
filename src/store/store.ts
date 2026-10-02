import { create } from "zustand";
import { repo } from "../db/repo";
import { pushSettingsUpdate } from "./data";

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
  minAmount: number | null;
  maxAmount: number | null;
  setMonth: (m: string) => void;
  setTheme: (t: ThemeMode) => void;
  setCurrency: (c: string) => void;
  setThemeLocal: (t: ThemeMode) => void;
  setCurrencyLocal: (c: string) => void;
  setEditing: (t: Transaction | null) => void;
  toggleCollapsed: () => void;
  setCollapsed: (c: boolean) => void;
  setSearch: (s: string) => void;
  setFilterCategory: (c: string | null) => void;
  setDateRange: (from: string | null, to: string | null) => void;
  setAmountRange: (min: number | null, max: number | null) => void;
}

type Transaction = import("../db/types").Transaction;

const THEME_KEY = "spendwise.theme";
const CURRENCY_KEY = "spendwise.currency";

function cacheSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

function cachedSetting<T extends string>(key: string): T | null {
  try {
    return localStorage.getItem(key) as T | null;
  } catch {
    return null;
  }
}

export const useStore = create<UIState>((set) => ({
  month: todayMonth(),
  theme: "system",
  currency: "₹",
  editing: null,
  collapsed: true, // input dock starts as the compact bar
  search: "",
  filterCategory: null,
  dateFrom: null,
  dateTo: null,
  minAmount: null,
  maxAmount: null,
  setMonth: (m) => set({ month: m }),
  setTheme: (t) => {
    set({ theme: t });
    cacheSetting(THEME_KEY, t);
    applyTheme(t);
    void pushSettingsUpdate({ theme: t });
  },
  setCurrency: (c) => {
    set({ currency: c });
    cacheSetting(CURRENCY_KEY, c);
    void pushSettingsUpdate({ currency: c });
  },
  // Apply without persisting to the cloud (used when cloud settings load).
  setThemeLocal: (t) => {
    set({ theme: t });
    cacheSetting(THEME_KEY, t);
    applyTheme(t);
  },
  setCurrencyLocal: (c) => {
    set({ currency: c });
    cacheSetting(CURRENCY_KEY, c);
  },
  setEditing: (t) => set({ editing: t }),
  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
  setCollapsed: (c) => set({ collapsed: c }),
  setSearch: (s) => set({ search: s }),
  setFilterCategory: (c) => set({ filterCategory: c }),
  setDateRange: (from, to) => set({ dateFrom: from, dateTo: to }),
  setAmountRange: (min, max) => set({ minAmount: min, maxAmount: max }),
}));

function todayMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function applyTheme(mode: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0f1115" : "#0ea5a4");
}

/** Runs once before mount: restores theme/currency (localStorage, with a
 *  one-time fallback to legacy IndexedDB settings for pre-cloud users). */
export async function initSettings() {
  let theme = cachedSetting<ThemeMode>(THEME_KEY);
  let currency = cachedSetting<string>(CURRENCY_KEY);
  if (!theme || !currency) {
    try {
      const legacy = await repo.getSettings();
      if (!theme && legacy.theme) {
        theme = legacy.theme;
        cacheSetting(THEME_KEY, theme);
      }
      if (!currency && legacy.currency) {
        currency = legacy.currency;
        cacheSetting(CURRENCY_KEY, currency);
      }
    } catch { /* legacy read is best-effort */ }
  }
  theme = theme ?? "system";
  currency = currency ?? "₹";
  useStore.setState({ theme, currency });
  applyTheme(theme);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (useStore.getState().theme === "system") applyTheme("system");
  });
}
