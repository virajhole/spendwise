// Repository layer — all persistence flows through these functions so a
// backend (Supabase/Firebase) can later implement the same interface.
import {
  db,
  DEFAULT_CATEGORIES,
  type Backup,
  type Budget,
  type Category,
  type Recurring,
  type Transaction,
} from "./db";

export const uid = (): string =>
  crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const repo = {
  // transactions
  addTransaction: (t: Transaction) => db.transactions.put(t),
  updateTransaction: (t: Partial<Transaction> & { id: string }) => db.transactions.update(t.id, t),
  async deleteTransaction(id: string): Promise<Transaction | undefined> {
    const t = await db.transactions.get(id);
    await db.transactions.delete(id);
    return t;
  },
  clearTransactions: () => db.transactions.clear(),

  // budgets
  setBudget: (month: string, amount: number) => db.budgets.put({ month, amount }),

  // categories
  addCategory: async (name: string, icon: string, color: string) => {
    const cat: Category = { id: uid(), name, icon, color, custom: true };
    await db.categories.put(cat);
    return cat;
  },
  deleteCategory: (id: string) => db.categories.delete(id),

  // recurring
  addRecurring: async (r: Omit<Recurring, "id" | "lastRun">) => {
    const rec: Recurring = { ...r, id: uid(), lastRun: "" };
    await db.recurrings.put(rec);
    return rec;
  },
  updateRecurring: (r: Partial<Recurring> & { id: string }) => db.recurrings.update(r.id, r),
  deleteRecurring: (id: string) => db.recurrings.delete(id),

  // settings (kv)
  getSetting: async <T,>(key: string, fallback: T): Promise<T> => {
    const row = await db.settings.get(key);
    return row === undefined ? fallback : (row.value as T);
  },
  setSetting: (key: string, value: unknown) => db.settings.put({ key, value }),

  // backup / restore
  async exportAll(): Promise<Backup> {
    const [transactions, budgets, categories, recurrings, settings] = await Promise.all([
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.categories.toArray(),
      db.recurrings.toArray(),
      db.settings.toArray(),
    ]);
    return { version: 1, exportedAt: new Date().toISOString(), transactions, budgets, categories, recurrings, settings };
  },
  async importAll(data: Backup, mode: "merge" | "replace" = "merge"): Promise<number> {
    if (!data || !Array.isArray(data.transactions)) throw new Error("Invalid backup file");
    await db.transaction("rw", [db.transactions, db.budgets, db.recurrings, db.settings, db.categories], async () => {
      if (mode === "replace") {
        await Promise.all([db.transactions.clear(), db.budgets.clear(), db.recurrings.clear()]);
      }
      await db.transactions.bulkPut(data.transactions);
      if (data.budgets) await db.budgets.bulkPut(data.budgets);
      if (data.recurrings) await db.recurrings.bulkPut(data.recurrings);
      if (data.settings) await db.settings.bulkPut(data.settings);
      if (data.categories) await db.categories.bulkPut(data.categories);
    });
    return data.transactions.length;
  },

  async clearAll() {
    await Promise.all([db.transactions.clear(), db.budgets.clear(), db.recurrings.clear(), db.settings.clear()]);
  },

  async ensureDefaults() {
    const count = await db.categories.count();
    if (count === 0) await db.categories.bulkPut(DEFAULT_CATEGORIES);
  },
};
