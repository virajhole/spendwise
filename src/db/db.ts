import Dexie, { type Table } from "dexie";

export interface Category {
  id: string;
  name: string;
  icon: string; // emoji
  color: string; // hex
  custom?: boolean;
}

export interface Transaction {
  id: string;
  amount: number; // always positive
  note: string;
  categoryId: string;
  date: string; // ISO "YYYY-MM-DD"
  time: string; // "HH:mm"
  createdAt: number; // epoch ms
  recurringId?: string;
}

export interface Budget {
  month: string; // "YYYY-MM"
  amount: number;
}

export interface Recurring {
  id: string;
  name: string;
  amount: number;
  categoryId: string;
  day: number; // day of month 1-28
  lastRun: string; // "YYYY-MM" last month applied
  active: boolean;
}

export interface Settings {
  key: string;
  value: unknown;
}

export interface AppMeta {
  key: string;
  value: unknown;
}

export interface Backup {
  version: 1;
  exportedAt: string;
  transactions: Transaction[];
  budgets: Budget[];
  categories: Category[];
  recurrings: Recurring[];
  settings: { key: string; value: unknown }[];
}

class ExpenseDB extends Dexie {
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
  categories!: Table<Category, string>;
  recurrings!: Table<Recurring, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super("spendwise-db");
    this.version(1).stores({
      transactions: "id, date, categoryId, createdAt",
      budgets: "month",
      categories: "id, name",
      recurrings: "id",
      settings: "key",
    });
  }
}

export const db = new ExpenseDB();

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "food", name: "Food", icon: "🍔", color: "#f97316" },
  { id: "travel", name: "Travel", icon: "🚌", color: "#3b82f6" },
  { id: "shopping", name: "Shopping", icon: "🛍️", color: "#ec4899" },
  { id: "bills", name: "Bills", icon: "💡", color: "#eab308" },
  { id: "health", name: "Health", icon: "🏥", color: "#22c55e" },
  { id: "fun", name: "Fun", icon: "🎮", color: "#8b5cf6" },
  { id: "other", name: "Other", icon: "📦", color: "#64748b" },
];
