import { db } from "./db";
import {
  uid,
  validateExpenseInput,
  DEFAULT_CATEGORIES,
  type Backup,
  type Budget,
  type Category,
  type DataRepository,
  type DateRange,
  type Recurring,
  type SettingsPatch,
  type ThemeValue,
  type Transaction,
} from "./types";
import { shiftMonth } from "../utils/calc";
import { validateLedgerWrite } from "../utils/finance";
import { validateNetBatch } from "../utils/netSettlement";

/**
 * Repository backed by IndexedDB (Dexie) — used when Supabase env vars are
 * missing (fresh clone / offline dev). It implements the exact same interface
 * as the Supabase repository, so the UI layer is identical in both modes.
 */
export function createDexieRepository(): DataRepository {
  return {
    kind: "local",

    async settleContact(txs: Transaction[]): Promise<void> {
      await db.transaction("rw", db.transactions, async () => {
        const rows = await db.transactions.toArray();
        txs.forEach(t => validateExpenseInput(t));
        validateNetBatch(txs, rows);
        await db.transactions.bulkPut(txs);
      });
    },

    async getExpenses(range: DateRange): Promise<Transaction[]> {
      return db.transactions.where("date").between(range.from, range.to, true, true).toArray();
    },

    async getAllExpenses(): Promise<Transaction[]> {
      return db.transactions.toArray();
    },

    async addExpense(t: Transaction): Promise<void> {
      validateExpenseInput(t);
      await db.transaction("rw", db.transactions, async () => {
        const previous = await db.transactions.get(t.id);
        // New ordinary expenses need no full-ledger read. Repayments and
        // replacements need the history to enforce outstanding balances.
        const needsHistory = previous || t.finance?.kind === "settlement";
        validateLedgerWrite(t, needsHistory ? await db.transactions.toArray() : []);
        await db.transactions.put(t);
      });
    },

    async updateExpense(id: string, patch: Partial<Omit<Transaction, "id">>): Promise<void> {
      if (patch.amount !== undefined) validateExpenseInput({ amount: patch.amount });
      await db.transaction("rw", db.transactions, async () => {
        const current = await db.transactions.get(id);
        if (!current) throw new Error("Expense not found");
        const next = { ...current, ...patch };
        validateLedgerWrite(next, await db.transactions.toArray());
        await db.transactions.put(next);
      });
    },

    async deleteExpense(id: string): Promise<void> {
      await db.transaction("rw", db.transactions, async () => {
        const row = await db.transactions.get(id);
        if (row?.finance?.offset || await db.transactions.filter(t => !!t.finance?.offset && t.finance.settlesId === id).count()) throw new Error("This entry is linked to an automatic balance adjustment");
        await db.transactions.filter(t => t.finance?.settlesId === id).delete();
        await db.transactions.delete(id);
      });
    },

    async getBudget(month: string): Promise<number | undefined> {
      const row = await db.budgets.get(month);
      if (row) return row.amount;
      const prev = await db.budgets.get(shiftMonth(month, -1));
      return prev?.amount ?? undefined;
    },

    async setBudget(month: string, amount: number): Promise<void> {
      await db.budgets.put({ month, amount } satisfies Budget);
    },

    async getCategories(): Promise<Category[]> {
      return db.categories.orderBy("name").toArray();
    },

    async addCategory(name: string, icon: string, color: string, id?: string): Promise<Category> {
      const cat: Category = { id: id ?? uid(), name, icon, color, custom: true };
      await db.categories.put(cat);
      return cat;
    },

    async deleteCategory(id: string): Promise<void> {
      await db.categories.delete(id);
    },

    async getRecurrings(): Promise<Recurring[]> {
      return db.recurrings.toArray();
    },

    async addRecurring(r: Omit<Recurring, "id" | "lastRun">, id?: string): Promise<Recurring> {
      const rec: Recurring = { ...r, id: id ?? uid(), lastRun: "" };
      await db.recurrings.put(rec);
      return rec;
    },

    async updateRecurring(id: string, patch: Partial<Omit<Recurring, "id">>): Promise<void> {
      await db.recurrings.update(id, patch);
    },

    async deleteRecurring(id: string): Promise<void> {
      await db.recurrings.delete(id);
    },

    async getSettings(): Promise<SettingsPatch> {
      const themeRow = await db.settings.get("spendwise.theme");
      const currencyRow = await db.settings.get("spendwise.currency");
      return {
        theme: themeRow?.value as ThemeValue | undefined,
        currency: currencyRow?.value as string | undefined,
      };
    },

    async updateSettings(patch) {
      const ops: Promise<unknown>[] = [];
      if (patch.theme !== undefined) ops.push(db.settings.put({ key: "spendwise.theme", value: patch.theme }));
      if (patch.currency !== undefined) ops.push(db.settings.put({ key: "spendwise.currency", value: patch.currency }));
      await Promise.all(ops);
    },

    async ensureDefaults(): Promise<void> {
      const count = await db.categories.count();
      if (count === 0) await db.categories.bulkPut(DEFAULT_CATEGORIES);
    },

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

    async importAll(data: Backup): Promise<number> {
      if (!data || !Array.isArray(data.transactions)) throw new Error("Invalid backup file");
      await db.transaction("rw", [db.transactions, db.budgets, db.recurrings, db.settings, db.categories], async () => {
        const incoming = [...data.transactions].sort((a, b) => Number(a.finance?.kind === "settlement") - Number(b.finance?.kind === "settlement"));
        for (const t of incoming) {
          validateExpenseInput(t);
          validateLedgerWrite(t, await db.transactions.toArray());
          await db.transactions.put(t);
        }
        const finalRows = await db.transactions.toArray();
        const groups = new Set(finalRows.filter(t => t.finance?.offset).map(t => t.finance!.netGroupId));
        for (const group of groups) {
          const total = finalRows.filter(t => t.finance?.offset && t.finance.netGroupId === group).reduce((sum, t) => sum + Math.round(t.amount * 100) * (t.finance?.direction === "in" ? 1 : -1), 0);
          if (total !== 0) throw new Error("Backup contains an incomplete balance adjustment");
        }
        if (data.budgets) await db.budgets.bulkPut(data.budgets);
        if (data.recurrings) await db.recurrings.bulkPut(data.recurrings);
        if (data.settings) await db.settings.bulkPut(data.settings);
        if (data.categories) await db.categories.bulkPut(data.categories);
      });
      return data.transactions.length;
    },

    async clearAll(): Promise<void> {
      await Promise.all([db.transactions.clear(), db.budgets.clear(), db.recurrings.clear(), db.settings.clear()]);
    },
  };
}
