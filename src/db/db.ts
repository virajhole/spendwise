import Dexie, { type Table } from "dexie";
import type { QueuedOp, Transaction, Category, Budget, Recurring } from "./types";

// Domain types live in ./types now — re-exported so existing imports from
// "../db/db" keep working.
export * from "./types";

/** A write that couldn't reach Supabase yet (offline / network failure). */
export interface PendingWrite {
  id: string;
  userId: string;
  op: QueuedOp;
  createdAt: number;
  attempts: number;
}

class ExpenseDB extends Dexie {
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
  categories!: Table<Category, string>;
  recurrings!: Table<Recurring, string>;
  settings!: Table<Settings, string>;
  pendingWrites!: Table<PendingWrite, string>;

  constructor() {
    super("spendwise-db");
    this.version(1).stores({
      transactions: "id, date, categoryId, createdAt",
      budgets: "month",
      categories: "id, name",
      recurrings: "id",
      settings: "key",
    });
    // v2: offline write queue (cloud mode only). Legacy tables stay as the
    // migration source and the local-only fallback store.
    this.version(2).stores({
      pendingWrites: "id, userId, createdAt",
    });
  }
}

export const db = new ExpenseDB();

export interface Settings {
  key: string;
  value: unknown;
}

export interface AppMeta {
  key: string;
  value: unknown;
}
