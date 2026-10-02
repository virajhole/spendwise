import { db } from "./db";
import { repo, cloudEnabled } from "./repo";
import { supabase } from "../lib/supabase";
import {
  categoryToRow,
  defaultCategoryId,
  DEFAULT_CATEGORY_META,
  expenseToRow,
  isUuid,
  mapLegacyCategoryId,
  recurringToRow,
  uuidFromSeed,
  type Category,
  type Recurring,
  type Transaction,
} from "./types";

/**
 * One-time import of legacy local (IndexedDB) data into Supabase.
 *
 * Everything is uploaded with DETERMINISTIC ids (hashed from the legacy ids),
 * so a re-run upserts instead of duplicating — the upload can safely be
 * retried after a failure. Local data is never deleted here.
 */

const DONE_KEY = "spendwise.migration.done";
const DISMISSED_KEY = "spendwise.migration.dismissed";

export type MigrationState = "done" | "dismissed" | "pending";

export function migrationState(): MigrationState {
  try {
    if (localStorage.getItem(DONE_KEY) === "1") return "done";
    if (localStorage.getItem(DISMISSED_KEY) === "1") return "dismissed";
    return "pending";
  } catch {
    return "done"; // no localStorage → can't remember a prompt; don't nag
  }
}

export function markMigrationDone(): void {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch { /* ignore */ }
}

export function markMigrationDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch { /* ignore */ }
}

/** True when this browser has meaningful legacy data worth importing. */
export async function hasLegacyData(): Promise<boolean> {
  try {
    const [txs, budgets, recurrings] = await Promise.all([
      db.transactions.count(),
      db.budgets.count(),
      db.recurrings.count(),
    ]);
    return txs > 0 || budgets > 0 || recurrings > 0;
  } catch {
    return false;
  }
}

export async function countLegacyTransactions(): Promise<number> {
  try {
    return await db.transactions.count();
  } catch {
    return 0;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface MigrationProgress {
  step: string;
  done: number;
  total: number;
}

/**
 * Uploads all legacy local data to Supabase. Throws on failure — nothing is
 * marked done unless the whole upload succeeds.
 * @returns the number of expenses uploaded
 */
export async function runMigration(onProgress: (p: MigrationProgress) => void): Promise<number> {
  if (!cloudEnabled) throw new Error("Cloud sync is not configured");
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in");
  const [legacyTxs, legacyBudgets, legacyCats, legacyRecs] = await Promise.all([
    db.transactions.toArray(),
    db.budgets.toArray(),
    db.categories.toArray(),
    db.recurrings.toArray(),
  ]);

  // Categories first so expense FKs resolve. mapLegacyCategoryId reuses the
  // user's existing cloud categories by id/name, maps built-in names onto the
  // user's own default ids, and hashes everything else per user.
  const existing = await repo.getCategories();
  const cloudIds = new Set(existing.map((c) => c.id));
  const catMap = new Map<string, string>();
  const catsToUpsert: Category[] = [];
  for (const c of legacyCats) {
    const mapped = mapLegacyCategoryId(c.id, userId, existing);
    catMap.set(c.id, mapped);
    if (!cloudIds.has(mapped)) {
      catsToUpsert.push({ ...c, id: mapped, custom: true });
      cloudIds.add(mapped);
    }
  }
  // If the legacy DB somehow has no categories but references default ids,
  // map those names onto the user's default categories.
  for (const t of legacyTxs) {
    if (t.categoryId && !catMap.has(t.categoryId)) {
      const builtIn = DEFAULT_CATEGORY_META.find((m) => m.name.toLowerCase() === t.categoryId);
      if (builtIn) catMap.set(t.categoryId, defaultCategoryId(userId, builtIn.name));
    }
  }

  onProgress({ step: "Uploading categories", done: 0, total: catsToUpsert.length });
  await batchUpsertCategories(catsToUpsert);

  // Recurring rules before expenses so recurring_id FKs resolve.
  const recMap = new Map<string, string>();
  onProgress({ step: "Uploading recurring rules", done: 0, total: legacyRecs.length });
  for (const r of legacyRecs) {
    const mapped = isUuid(r.id) ? r.id : uuidFromSeed(`rec:${userId}:${r.id}`);
    recMap.set(r.id, mapped);
    const rec: Recurring = {
      ...r,
      id: mapped,
      categoryId: catMap.get(r.categoryId) ?? "",
    };
    await upsertRecurring(rec);
  }

  onProgress({ step: "Uploading expenses", done: 0, total: legacyTxs.length });
  const txs: Transaction[] = legacyTxs.map((t) => ({
    id: isUuid(t.id) ? t.id : uuidFromSeed(`exp:${userId}:${t.id}`),
    amount: t.amount,
    note: t.note,
    categoryId: t.categoryId ? (catMap.get(t.categoryId) ?? "") : "",
    date: t.date,
    time: t.time,
    createdAt: t.createdAt,
    recurringId: t.recurringId ? recMap.get(t.recurringId) : undefined,
  }));
  let uploaded = 0;
  for (const part of chunk(txs, 200)) {
    await batchUpsertExpenses(part);
    uploaded += part.length;
    onProgress({ step: "Uploading expenses", done: uploaded, total: txs.length });
  }

  onProgress({ step: "Uploading budgets", done: 0, total: legacyBudgets.length });
  for (const b of legacyBudgets) {
    await repo.setBudget(b.month.slice(0, 7), b.amount);
  }

  // Carry over theme/currency if the cloud has none yet.
  try {
    const [themeRow, currencyRow] = await Promise.all([
      db.settings.get("spendwise.theme"),
      db.settings.get("spendwise.currency"),
    ]);
    const cloudSettings = await repo.getSettings();
    if (!cloudSettings.theme && themeRow) await repo.updateSettings({ theme: themeRow.value as "light" | "dark" | "system" });
    if (!cloudSettings.currency && currencyRow) await repo.updateSettings({ currency: currencyRow.value as string });
  } catch { /* non-fatal */ }

  return legacyTxs.length;
}

// -- batch helpers -----------------------------------------------------------
// The repository interface is row-oriented; migration needs bulk upserts, so
// these talk to the Supabase client through small helpers kept here to avoid
// exposing raw client access to the rest of the app.

async function batchUpsertCategories(cats: Category[]): Promise<void> {
  if (!cats.length) return;
  const res = await supabase.from("categories").upsert(cats.map(categoryToRow));
  if (res.error) throw new Error(res.error.message);
}

async function batchUpsertExpenses(txs: Transaction[]): Promise<void> {
  if (!txs.length) return;
  const res = await supabase.from("expenses").upsert(txs.map(expenseToRow));
  if (res.error) throw new Error(res.error.message);
}

async function upsertRecurring(rec: Recurring): Promise<void> {
  const res = await supabase.from("recurring_expenses").upsert(recurringToRow(rec));
  if (res.error) throw new Error(res.error.message);
}
