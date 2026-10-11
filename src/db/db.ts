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

/** Per-account snapshot of cloud data, used to reopen the app offline. */
export interface CloudCacheRecord {
  id: string;
  userId: string;
  kind: string;
  value: unknown;
  updatedAt: number;
}

class ExpenseDB extends Dexie {
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
  categories!: Table<Category, string>;
  recurrings!: Table<Recurring, string>;
  settings!: Table<Settings, string>;
  pendingWrites!: Table<PendingWrite, string>;
  cloudCache!: Table<CloudCacheRecord, string>;

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
    this.version(3).stores({
      transactions: "id, date, categoryId, createdAt",
      budgets: "month",
      categories: "id, name",
      recurrings: "id",
      settings: "key",
      pendingWrites: "id, userId, createdAt",
      cloudCache: "id, userId, kind, [userId+kind], updatedAt",
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
