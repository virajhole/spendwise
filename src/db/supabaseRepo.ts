import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addDays,
  budgetToRow,
  categoryToRow,
  dayStartISO,
  defaultCategoriesFor,
  expenseToRow,
  firstOfMonth,
  isUuid,
  mapLegacyCategoryId,
  patchToExpenseRow,
  recurringToRow,
  rowToCategory,
  rowToExpense,
  rowToRecurring,
  uid,
  uuidFromSeed,
  validateExpenseInput,
  type Backup,
  type BudgetRow,
  type Category,
  type CategoryRow,
  type DataRepository,
  type DateRange,
  type ExpensePatch,
  type ExpenseRow,
  type QueuedOp,
  type Recurring,
  type RecurringRow,
  type SettingsPatch,
  type SettingsRow,
  type Transaction,
} from "./types";

const PAGE = 1000;
const CHUNK = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface ErrorResponse {
  error: { message: string } | null;
}

function throwIfError(res: ErrorResponse): void {
  if (res.error) throw new Error(res.error.message);
}

function shiftMonthBack(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function patchExpense(client: SupabaseClient, id: string, patch: ExpensePatch): Promise<void> {
  const row = patchToExpenseRow(patch);
  if (Object.keys(row).length === 0) return;
  const res = await client.from("expenses").update(row).eq("id", id);
  throwIfError(res);
}

/**
 * Apply a queued (offline) write directly. Used both by the offline flush loop
 * and by optimistic writes in cloud mode — upserts make replays idempotent.
 */
export async function applyQueuedOp(client: SupabaseClient, op: QueuedOp): Promise<void> {
  switch (op.kind) {
    case "expense.upsert": {
      validateExpenseInput(op.tx);
      const res = await client.from("expenses").upsert(expenseToRow(op.tx));
      throwIfError(res);
      return;
    }
    case "expense.update":
      await patchExpense(client, op.id, op.patch);
      return;
    case "expense.delete": {
      const res = await client.from("expenses").delete().eq("id", op.id);
      throwIfError(res);
      return;
    }
    case "budget.set": {
      const res = await client
        .from("budgets")
        .upsert(budgetToRow(op.month, op.amount), { onConflict: "user_id,month" });
      throwIfError(res);
      return;
    }
    case "category.add": {
      const res = await client.from("categories").upsert(categoryToRow(op.category));
      throwIfError(res);
      return;
    }
    case "category.delete": {
      const res = await client.from("categories").delete().eq("id", op.id);
      throwIfError(res);
      return;
    }
    case "recurring.add": {
      const res = await client.from("recurring_expenses").upsert(recurringToRow(op.recurring));
      throwIfError(res);
      return;
    }
    case "recurring.update": {
      const row: Partial<RecurringRow> = {};
      if (op.patch.name !== undefined) row.note = op.patch.name;
      if (op.patch.amount !== undefined) row.amount = op.patch.amount;
      if (op.patch.categoryId !== undefined) row.category_id = op.patch.categoryId || null;
      if (op.patch.day !== undefined) row.day_of_month = op.patch.day;
      if (op.patch.active !== undefined) row.active = op.patch.active;
      if (op.patch.lastRun !== undefined) {
        row.last_run = op.patch.lastRun ? `${op.patch.lastRun}-01` : null;
      }
      if (Object.keys(row).length === 0) return;
      const res = await client.from("recurring_expenses").update(row).eq("id", op.id);
      throwIfError(res);
      return;
    }
    case "recurring.delete": {
      const res = await client.from("recurring_expenses").delete().eq("id", op.id);
      throwIfError(res);
      return;
    }
    case "settings.update": {
      const { data } = await client.auth.getUser();
      const userId = data.user?.id;
      if (!userId) throw new Error("Not signed in");
      const res = await client
        .from("settings")
        .upsert({ user_id: userId, ...op.patch }, { onConflict: "user_id" });
      throwIfError(res);
      return;
    }
  }
}

/**
 * Repository backed by Supabase (Postgres + RLS). Every insert omits user_id —
 * the database defaults it to auth.uid(), and RLS makes rows invisible to
 * anyone else. Expense/category/recurring writes are UPSERTs keyed by
 * client-generated ids, which makes offline retries, recurring auto-adds and
 * migrations idempotent.
 */
export function createSupabaseRepository(client: SupabaseClient): DataRepository {
  async function upsertExpenses(txs: Transaction[]): Promise<void> {
    for (const part of chunk(txs, CHUNK)) {
      const res = await client.from("expenses").upsert(part.map(expenseToRow));
      throwIfError(res);
    }
  }

  const repo: DataRepository = {
    kind: "supabase",

    // ---------------------------------------------------------- expenses
    async getExpenses(range: DateRange): Promise<Transaction[]> {
      const res = await client
        .from("expenses")
        .select("*")
        .gte("spent_at", dayStartISO(range.from))
        .lt("spent_at", dayStartISO(addDays(range.to, 1)))
        .order("spent_at", { ascending: false });
      throwIfError(res);
      return ((res.data ?? []) as ExpenseRow[]).map(rowToExpense);
    },

    async getAllExpenses(): Promise<Transaction[]> {
      const all: ExpenseRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const res = await client
          .from("expenses")
          .select("*")
          .order("created_at", { ascending: true })
          .range(from, from + PAGE - 1);
        throwIfError(res);
        const rows = (res.data ?? []) as ExpenseRow[];
        all.push(...rows);
        if (rows.length < PAGE) break;
      }
      return all.map(rowToExpense);
    },

    async addExpense(t: Transaction): Promise<void> {
      validateExpenseInput(t);
      await upsertExpenses([t]);
    },

    async updateExpense(id: string, patch: ExpensePatch): Promise<void> {
      await patchExpense(client, id, patch);
    },

    async deleteExpense(id: string): Promise<void> {
      const res = await client.from("expenses").delete().eq("id", id);
      throwIfError(res);
    },

    // ---------------------------------------------------------- budgets
    async getBudget(month: string): Promise<number | undefined> {
      const res = await client
        .from("budgets")
        .select("month, amount")
        .in("month", [firstOfMonth(month), firstOfMonth(shiftMonthBack(month))])
        .order("month", { ascending: false })
        .limit(1);
      throwIfError(res);
      const row = (res.data ?? [])[0] as BudgetRow | undefined;
      return row ? Number(row.amount) : undefined;
    },

    async setBudget(month: string, amount: number): Promise<void> {
      const res = await client
        .from("budgets")
        .upsert(budgetToRow(month, amount), { onConflict: "user_id,month" });
      throwIfError(res);
    },

    // ---------------------------------------------------------- categories
    async getCategories(): Promise<Category[]> {
      const res = await client.from("categories").select("*").order("name", { ascending: true });
      throwIfError(res);
      return ((res.data ?? []) as CategoryRow[]).map(rowToCategory);
    },

    async addCategory(name: string, icon: string, color: string, id?: string): Promise<Category> {
      const cat: Category = { id: id ?? uid(), name, icon, color, custom: true };
      const res = await client.from("categories").upsert(categoryToRow(cat));
      throwIfError(res);
      return cat;
    },

    async deleteCategory(id: string): Promise<void> {
      const res = await client.from("categories").delete().eq("id", id);
      throwIfError(res);
    },

    // ---------------------------------------------------------- recurring
    async getRecurrings(): Promise<Recurring[]> {
      const res = await client
        .from("recurring_expenses")
        .select("*")
        .order("created_at", { ascending: true });
      throwIfError(res);
      return ((res.data ?? []) as RecurringRow[]).map(rowToRecurring);
    },

    async addRecurring(r: Omit<Recurring, "id" | "lastRun">, id?: string): Promise<Recurring> {
      const rec: Recurring = { ...r, id: id ?? uid(), lastRun: "" };
      const res = await client.from("recurring_expenses").upsert(recurringToRow(rec));
      throwIfError(res);
      return rec;
    },

    async updateRecurring(id: string, patch: Partial<Omit<Recurring, "id">>): Promise<void> {
      await applyQueuedOp(client, { kind: "recurring.update", id, patch });
    },

    async deleteRecurring(id: string): Promise<void> {
      const res = await client.from("recurring_expenses").delete().eq("id", id);
      throwIfError(res);
    },

    // ---------------------------------------------------------- settings
    async getSettings(): Promise<SettingsPatch> {
      const res = await client.from("settings").select("currency, theme").maybeSingle();
      throwIfError(res);
      const row = res.data as Pick<SettingsRow, "currency" | "theme"> | null;
      return row ? { currency: row.currency, theme: row.theme } : {};
    },

    async updateSettings(patch: SettingsPatch): Promise<void> {
      await applyQueuedOp(client, { kind: "settings.update", patch });
    },

    // ---------------------------------------------------------- misc
    async ensureDefaults(): Promise<void> {
      const res = await client.from("categories").select("id").limit(1);
      throwIfError(res);
      if ((res.data ?? []).length > 0) return;
      const { data } = await client.auth.getUser();
      const userId = data.user?.id;
      if (!userId) throw new Error("Not signed in");
      // Built-in ids are PER USER — two accounts must never share them.
      for (const part of chunk(defaultCategoriesFor(userId), CHUNK)) {
        const up = await client.from("categories").upsert(part.map(categoryToRow));
        throwIfError(up);
      }
    },

    async exportAll(): Promise<Backup> {
      const [expenses, budgetsRes, categoriesRes, recurringsRes, settingsRes] = await Promise.all([
        repo.getAllExpenses(),
        client.from("budgets").select("*"),
        client.from("categories").select("*"),
        client.from("recurring_expenses").select("*"),
        client.from("settings").select("*").maybeSingle(),
      ]);
      for (const r of [budgetsRes, categoriesRes, recurringsRes, settingsRes]) {
        throwIfError(r as ErrorResponse);
      }
      const settingsRow = settingsRes.data as Pick<SettingsRow, "currency" | "theme"> | null;
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        transactions: expenses,
        budgets: ((budgetsRes.data ?? []) as BudgetRow[]).map((b) => ({
          month: b.month.slice(0, 7),
          amount: Number(b.amount),
        })),
        categories: ((categoriesRes.data ?? []) as CategoryRow[]).map(rowToCategory),
        recurrings: ((recurringsRes.data ?? []) as RecurringRow[]).map(rowToRecurring),
        settings: settingsRow
          ? [
              { key: "spendwise.theme", value: settingsRow.theme },
              { key: "spendwise.currency", value: settingsRow.currency },
            ]
          : [],
      };
    },

    async importAll(data: Backup): Promise<number> {
      if (!data || !Array.isArray(data.transactions)) throw new Error("Invalid backup file");
      const { data: userData } = await client.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");

      // 1. categories — map every incoming id onto a valid cloud id first so
      //    expense FKs always resolve.
      const existing = await repo.getCategories();
      const cloudIds = new Set(existing.map((c) => c.id));
      const catMap = new Map<string, string>();
      for (const c of data.categories ?? []) {
        const mapped = mapLegacyCategoryId(c.id, userId, existing);
        catMap.set(c.id, mapped);
        if (!cloudIds.has(mapped)) {
          const res = await client
            .from("categories")
            .upsert(categoryToRow({ ...c, id: mapped, custom: true }));
          throwIfError(res);
          cloudIds.add(mapped);
        }
      }

      // 2. recurring rules (before expenses, so recurring_id FKs resolve).
      //    uuid-shaped ids are trusted (backups produced by this app); legacy
      //    string ids are hashed per user, deterministically.
      const recMap = new Map<string, string>();
      for (const r of data.recurrings ?? []) {
        const mapped = isUuid(r.id) ? r.id : uuidFromSeed(`rec:${userId}:${r.id}`);
        recMap.set(r.id, mapped);
        const res = await client
          .from("recurring_expenses")
          .upsert(
            recurringToRow({ ...r, id: mapped, categoryId: catMap.get(r.categoryId) ?? "" }),
          );
        throwIfError(res);
      }

      // 3. expenses
      const txs: Transaction[] = data.transactions.map((t) => ({
        ...t,
        id: isUuid(t.id) ? t.id : uuidFromSeed(`exp:${userId}:${t.id}`),
        categoryId: t.categoryId ? (catMap.get(t.categoryId) ?? "") : "",
        recurringId: t.recurringId ? recMap.get(t.recurringId) : undefined,
      }));
      await upsertExpenses(txs);

      // 4. budgets
      for (const b of data.budgets ?? []) {
        const res = await client
          .from("budgets")
          .upsert(budgetToRow(b.month.slice(0, 7), b.amount), { onConflict: "user_id,month" });
        throwIfError(res);
      }

      // 5. settings
      const theme = data.settings?.find((s) => s.key === "spendwise.theme")?.value as string | undefined;
      const currency = data.settings?.find((s) => s.key === "spendwise.currency")?.value as string | undefined;
      const patch: SettingsPatch = {};
      if (theme === "light" || theme === "dark" || theme === "system") patch.theme = theme;
      if (currency) patch.currency = currency;
      if (Object.keys(patch).length) await applyQueuedOp(client, { kind: "settings.update", patch });

      return data.transactions.length;
    },

    async clearAll(): Promise<void> {
      const results = await Promise.all([
        client.from("expenses").delete().not("id", "is", null),
        client.from("budgets").delete().not("id", "is", null),
        client.from("recurring_expenses").delete().not("id", "is", null),
      ]);
      for (const r of results) throwIfError(r);
    },
  };

  return repo;
}
