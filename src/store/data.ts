import { useEffect } from "react";
import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  applyOp,
  clearQueuedOps,
  cloudEnabled,
  dropQueuedExpense,
  enqueueOp,
  flushQueue,
  loadPendingOps,
  patchQueuedExpense,
  repo,
  removeQueuedOp,
  isNetworkError,
  isUuid,
  validateExpenseInput,
  rowToExpense,
  uid,
  uuidFromSeed,
  monthEndDate,
  type Category,
  type DateRange,
  type ExpensePatch,
  type ExpenseRow,
  type QueuedOp,
  type Recurring,
  type SettingsPatch,
  type Transaction,
} from "../db/repo";
import type { PendingWrite } from "../db/db";
import { hasLegacyData, markMigrationDismissed, markMigrationDone, migrationState, runMigration } from "../db/migrate";
import { pushToast } from "./toast";
import { applyTheme, useStore as useUIStore } from "./store";

/**
 * Cloud/local data store.
 *
 * - Reads: only the selected month (or custom date range) is fetched from the
 *   repository, cached per range and kept live via a Supabase realtime
 *   subscription (cloud mode).
 * - Writes: optimistic. The change is applied to the local state instantly,
 *   queued durably (IndexedDB) and sent to Supabase. Network failures keep
 *   the queued change (synced automatically when back online); hard failures
 *   roll back and surface a toast with a Retry button.
 */

interface DataState {
  userId: string | null;
  booted: boolean;
  categories: Category[] | undefined; // undefined = loading
  recurrings: Recurring[] | undefined; // undefined = loading
  budgets: Record<string, number | null>; // month -> amount (null = loaded, none)
  ranges: Record<string, Transaction[]>; // "from:to" -> server rows
  loadingRange: string | null;
  pendingOps: PendingWrite[]; // queued offline writes (cloud mode)
  migration: {
    status: "idle" | "checking" | "prompt" | "running";
    progress: string;
    error: string | null;
  };
}

export const useDataStore = create<DataState>(() => ({
  userId: null,
  booted: false,
  categories: undefined,
  recurrings: undefined,
  budgets: {},
  ranges: {},
  loadingRange: null,
  pendingOps: [],
  migration: { status: "idle", progress: "", error: null },
}));

const get = useDataStore.getState;
const set = useDataStore.setState;

let bootedFor: string | null = null;
let channel: RealtimeChannel | null = null;
let recurringRun: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// React hooks (components read data ONLY through these)
// ---------------------------------------------------------------------------

/** Transactions for the viewed month (or the custom date filter range).
 *  `undefined` while loading → callers show skeletons. */
export function useTransactions(): Transaction[] | undefined {
  const { month, dateFrom, dateTo } = useUIStore();
  const userId = useDataStore((s) => s.userId);
  const booted = useDataStore((s) => s.booted);
  const ranges = useDataStore((s) => s.ranges);
  const pendingOps = useDataStore((s) => s.pendingOps);
  const range = effectiveRange(month, dateFrom, dateTo);
  const key = `${range.from}:${range.to}`;

  useEffect(() => {
    if (!userId || !booted) return;
    void loadRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, booted, key]);

  const rows = ranges[key];
  if (rows === undefined) return undefined;
  const pendingTxs = pendingOps
    .filter((op) => op.op.kind === "expense.upsert" && inRange(op.op.tx.date, range))
    .map((op) => (op.op.kind === "expense.upsert" ? op.op.tx : null))
    .filter((tx): tx is Transaction => tx !== null && !rows.some((r) => r.id === tx.id));
  return [...rows, ...pendingTxs];
}

export function useCategories(): Category[] {
  const categories = useDataStore((s) => s.categories);
  return categories ?? [];
}

export function useBudget(month: string): number | undefined {
  const userId = useDataStore((s) => s.userId);
  const booted = useDataStore((s) => s.booted);
  const budgets = useDataStore((s) => s.budgets);
  useEffect(() => {
    if (userId && booted && !(month in budgets)) void loadBudget(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, booted, month, budgets]);
  const v = budgets[month];
  return typeof v === "number" ? v : undefined;
}

export function useRecurrings(): Recurring[] {
  return useDataStore((s) => s.recurrings) ?? [];
}

// ---------------------------------------------------------------------------
// Range helpers
// ---------------------------------------------------------------------------

export function effectiveRange(month: string, dateFrom: string | null, dateTo: string | null): DateRange {
  if (dateFrom || dateTo) {
    return { from: dateFrom ?? `${month}-01`, to: dateTo ?? monthEndDate(month) };
  }
  return { from: `${month}-01`, to: monthEndDate(month) };
}

function currentRange(): DateRange {
  const { month, dateFrom, dateTo } = useUIStore.getState();
  return effectiveRange(month, dateFrom, dateTo);
}

function inRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

// ---------------------------------------------------------------------------
// Boot / teardown
// ---------------------------------------------------------------------------

export async function bootUserData(userId: string): Promise<void> {
  if (bootedFor === userId) return;
  bootedFor = userId;
  set({
    userId,
    booted: false,
    categories: undefined,
    recurrings: undefined,
    budgets: {},
    ranges: {},
    loadingRange: null,
    pendingOps: [],
    migration: { status: "idle", progress: "", error: null },
  });

  if (!cloudEnabled) {
    // Local-only mode (Supabase env vars missing): same repo interface, Dexie.
    await repo.ensureDefaults();
    const [categories, recurrings] = await Promise.all([repo.getCategories(), repo.getRecurrings()]);
    set({ categories, recurrings, booted: true });
    return;
  }

  // Replay writes queued by previous offline sessions before first fetch.
  const flush = await flushQueue(userId);
  if (flush.synced > 0) pushToast({ kind: "success", message: `Synced ${flush.synced} offline change${flush.synced === 1 ? "" : "s"}` });
  if (flush.failed > 0) {
    pushToast({
      kind: "error",
      message: `${flush.failed} change${flush.failed === 1 ? "" : "s"} failed to sync`,
      action: { label: "Retry", run: () => void flushAndRefresh(userId) },
    });
  }

  // Cloud settings win over the local cache (cross-device consistency).
  try {
    const s = await repo.getSettings();
    if (s.theme) useUIStore.getState().setThemeLocal(s.theme);
    if (s.currency) useUIStore.getState().setCurrencyLocal(s.currency);
  } catch { /* non-fatal */ }

  await repo.ensureDefaults();
  const [categories, recurrings, pendingOps] = await Promise.all([
    repo.getCategories(),
    repo.getRecurrings(),
    loadPendingOps(userId),
  ]).catch((e) => {
    pushToast({
      kind: "error",
      message: `Couldn't load your data — ${e instanceof Error ? e.message : "error"}`,
      action: { label: "Retry", run: () => location.reload() },
    });
    return [undefined, undefined, []] as const;
  });
  set({ categories, recurrings, pendingOps: pendingOps as PendingWrite[], booted: true });

  subscribeRealtime(userId);
  void checkMigration();

  window.addEventListener("online", handleOnline);
}

export function resetDataStore(): void {
  bootedFor = null;
  unsubscribeRealtime();
  window.removeEventListener("online", handleOnline);
  set({
    userId: null,
    booted: false,
    categories: undefined,
    recurrings: undefined,
    budgets: {},
    ranges: {},
    loadingRange: null,
    pendingOps: [],
    migration: { status: "idle", progress: "", error: null },
  });
}

function handleOnline(): void {
  const userId = get().userId;
  if (userId && cloudEnabled) void flushAndRefresh(userId);
}

async function flushAndRefresh(userId: string): Promise<void> {
  const result = await flushQueue(userId);
  if (result.synced > 0) {
    await reloadPendingOps();
    await refreshCurrentRange(true);
  }
  if (result.failed > 0) {
    pushToast({
      kind: "error",
      message: `${result.failed} change${result.failed === 1 ? "" : "s"} failed to sync`,
      action: { label: "Retry", run: () => void flushAndRefresh(userId) },
    });
  }
}

// ---------------------------------------------------------------------------
// Realtime (expenses) — other devices update live
// ---------------------------------------------------------------------------

function subscribeRealtime(userId: string): void {
  unsubscribeRealtime();
  channel = supabase
    .channel(`expenses-user-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "expenses", filter: `user_id=eq.${userId}` },
      (payload) => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          const tx = rowToExpense(payload.new as ExpenseRow);
          void removePendingForTx(tx.id);
          applyUpsertLocal(tx);
        } else if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id;
          if (id) {
            void removePendingForTx(id);
            applyRemoveLocal(id);
          }
        }
      },
    )
    .subscribe();
}

function unsubscribeRealtime(): void {
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
}

/** Drop the matching queued op if a row we added optimistically just synced. */
async function removePendingForTx(txId: string): Promise<void> {
  const match = get().pendingOps.find((op) => op.op.kind === "expense.upsert" && op.op.tx.id === txId);
  if (!match) return;
  await removeQueuedOp(match.id);
  set((s) => ({ pendingOps: s.pendingOps.filter((op) => op.id !== match.id) }));
}

// ---------------------------------------------------------------------------
// Local (optimistic) state mutations
// ---------------------------------------------------------------------------

function applyUpsertLocal(tx: Transaction): void {
  set((s) => {
    const ranges = { ...s.ranges };
    for (const [key, rows] of Object.entries(ranges)) {
      const [from, to] = key.split(":");
      if (!inRange(tx.date, { from, to })) continue;
      const idx = rows.findIndex((r) => r.id === tx.id);
      ranges[key] = idx >= 0 ? rows.map((r) => (r.id === tx.id ? tx : r)) : [...rows, tx];
    }
    return { ranges };
  });
}

function applyRemoveLocal(id: string): void {
  set((s) => {
    const ranges: Record<string, Transaction[]> = {};
    for (const [key, rows] of Object.entries(s.ranges)) {
      ranges[key] = rows.filter((r) => r.id !== id);
    }
    return { ranges };
  });
}

function applyPatchLocal(id: string, patch: ExpensePatch): void {
  set((s) => {
    const ranges: Record<string, Transaction[]> = {};
    for (const [key, rows] of Object.entries(s.ranges)) {
      ranges[key] = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    }
    return { ranges };
  });
}

function findTxAnywhere(id: string): Transaction | undefined {
  for (const rows of Object.values(get().ranges)) {
    const found = rows.find((r) => r.id === id);
    if (found) return found;
  }
  const pending = get().pendingOps.find((op) => op.op.kind === "expense.upsert" && op.op.tx.id === id);
  return pending?.op.kind === "expense.upsert" ? pending.op.tx : undefined;
}

function findPendingUpsert(id: string): PendingWrite | undefined {
  return get().pendingOps.find((op) => op.op.kind === "expense.upsert" && op.op.tx.id === id);
}

async function reloadPendingOps(): Promise<void> {
  const userId = get().userId;
  if (!userId) return;
  set({ pendingOps: await loadPendingOps(userId) });
}

// ---------------------------------------------------------------------------
// The optimistic write primitive
// ---------------------------------------------------------------------------

interface WriteOpts {
  rollback: () => void;
  /** Short noun for toasts, e.g. "expense", "budget", "category". */
  label: string;
}

/**
 * Optimistic write pipeline (cloud mode):
 *   apply locally → enqueue durably → send to Supabase
 *   - success: drop the queued op (local state already matches)
 *   - offline/network error: keep op queued, sync later (toast: saved offline)
 *   - other error: ROLL BACK the optimistic change + toast with Retry
 */
async function runWrite(op: QueuedOp, opts: WriteOpts): Promise<void> {
  const userId = get().userId;
  let queuedId = "";
  if (cloudEnabled && userId) queuedId = await enqueueOp(userId, op);
  try {
    await applyOp(op);
    if (queuedId) {
      await removeQueuedOp(queuedId);
      await reloadPendingOps();
      if (get().pendingOps.length > 0 && get().userId) {
        void flushAndRefresh(get().userId!); // opportunistically drain older ops
      }
    }
  } catch (e) {
    if (isNetworkError(e)) {
      pushToast({ kind: "info", message: `${opts.label} saved offline — will sync when you're back online` });
      await reloadPendingOps();
      return;
    }
    // Hard error: the optimistic change is rolled back AND the queued op is
    // dropped (Retry re-enqueues it) so one poison write can't haunt the queue.
    if (queuedId) {
      await removeQueuedOp(queuedId);
      await reloadPendingOps();
    }
    opts.rollback();
    const message = e instanceof Error ? e.message : "Something went wrong";
    pushToast({
      kind: "error",
      message: `Couldn't save ${opts.label} — ${message}`,
      action: { label: "Retry", run: () => void runWrite(op, opts) },
    });
  }
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

function resolveCategoryId(categoryId: string): string {
  if (!categoryId) return "";
  const cats = get().categories;
  if (!cats) {
    // Categories not loaded yet — never send a non-UUID category to the cloud
    // (Postgres would reject it); local mode keeps its string ids.
    return cloudEnabled && !isUuid(categoryId) ? "" : categoryId;
  }
  if (cats.some((c) => c.id === categoryId)) return categoryId;
  // Legacy/local ids like "other" map onto the matching category by name.
  return cats.find((c) => c.name.toLowerCase() === categoryId.toLowerCase())?.id ?? "";
}

export async function saveExpense(input: {
  id?: string;
  amount: number;
  note: string;
  categoryId: string;
  date: string;
  time: string;
  recurringId?: string;
}): Promise<Transaction | null> {
  try {
    validateExpenseInput(input);
  } catch (e) {
    pushToast({ kind: "error", message: e instanceof Error ? e.message : "Invalid expense" });
    return null;
  }
  const tx: Transaction = {
    id: input.id ?? uid(),
    amount: input.amount,
    note: input.note,
    categoryId: resolveCategoryId(input.categoryId),
    date: input.date,
    time: input.time,
    createdAt: Date.now(),
    recurringId: input.recurringId,
  };
  const existing = findTxAnywhere(tx.id);
  applyUpsertLocal(tx);
  await runWrite({ kind: "expense.upsert", tx }, {
    rollback: () => (existing ? applyUpsertLocal(existing) : applyRemoveLocal(tx.id)),
    label: "expense",
  });
  return tx;
}

export async function updateExpense(id: string, patch: ExpensePatch): Promise<void> {
  const resolved: ExpensePatch = {
    ...patch,
    ...(patch.categoryId !== undefined ? { categoryId: resolveCategoryId(patch.categoryId) } : {}),
  };
  const pending = findPendingUpsert(id);
  if (pending && pending.op.kind === "expense.upsert") {
    // Row never reached the server — collapse the edit into the queued insert.
    applyPatchLocal(id, resolved);
    await patchQueuedExpense(get().userId ?? "", id, resolved);
    set((s) => ({
      pendingOps: s.pendingOps.map((op) =>
        op.id === pending.id && op.op.kind === "expense.upsert"
          ? { ...op, op: { ...op.op, tx: { ...op.op.tx, ...resolved } } }
          : op,
      ),
    }));
    return;
  }
  const prev = findTxAnywhere(id);
  applyPatchLocal(id, resolved);
  await runWrite({ kind: "expense.update", id, patch: resolved }, {
    rollback: () => prev && applyUpsertLocal(prev),
    label: "expense",
  });
}

export async function deleteExpense(id: string): Promise<Transaction | undefined> {
  const pending = findPendingUpsert(id);
  if (pending) {
    // Never synced — just forget it (and any queued edits for it).
    await dropQueuedExpense(get().userId ?? "", id);
    applyRemoveLocal(id);
    await reloadPendingOps();
    return pending.op.kind === "expense.upsert" ? pending.op.tx : undefined;
  }
  const prev = findTxAnywhere(id);
  applyRemoveLocal(id);
  await runWrite({ kind: "expense.delete", id }, {
    rollback: () => prev && applyUpsertLocal(prev),
    label: "expense",
  });
  return prev;
}

export async function restoreExpense(t: Transaction): Promise<void> {
  await saveExpense({ ...t, id: t.id });
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export async function setBudget(month: string, amount: number): Promise<void> {
  const prev = get().budgets[month];
  set((s) => ({ budgets: { ...s.budgets, [month]: amount } }));
  await runWrite({ kind: "budget.set", month, amount }, {
    rollback: () =>
      set((s) => {
        const budgets = { ...s.budgets };
        if (prev === undefined) delete budgets[month];
        else budgets[month] = prev;
        return { budgets };
      }),
    label: "budget",
  });
}

async function loadBudget(month: string): Promise<void> {
  set((s) => ({ budgets: { ...s.budgets, [month]: null } })); // mark in-flight
  try {
    const amount = await repo.getBudget(month);
    if (typeof amount === "number") set((s) => ({ budgets: { ...s.budgets, [month]: amount } }));
  } catch {
    pushToast({
      kind: "error",
      message: "Couldn't load budget",
      action: { label: "Retry", run: () => void loadBudget(month) },
    });
  }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function addCategory(name: string, icon: string, color: string): Promise<void> {
  const cat: Category = { id: uid(), name, icon, color, custom: true };
  set((s) => ({ categories: [...(s.categories ?? []), cat].sort((a, b) => a.name.localeCompare(b.name)) }));
  await runWrite({ kind: "category.add", category: cat }, {
    rollback: () => set((s) => ({ categories: s.categories?.filter((c) => c.id !== cat.id) })),
    label: "category",
  });
}

export async function deleteCategory(id: string): Promise<void> {
  const prev = get().categories?.find((c) => c.id === id);
  set((s) => ({ categories: s.categories?.filter((c) => c.id !== id) }));
  await runWrite({ kind: "category.delete", id }, {
    rollback: () =>
      prev &&
      set((s) => ({
        categories: s.categories ? [...s.categories, prev].sort((a, b) => a.name.localeCompare(b.name)) : [prev],
      })),
    label: "category",
  });
}

// ---------------------------------------------------------------------------
// Recurring expenses
// ---------------------------------------------------------------------------

export async function addRecurring(r: Omit<Recurring, "id" | "lastRun">): Promise<void> {
  const rec: Recurring = { ...r, id: uid(), lastRun: "" };
  set((s) => ({ recurrings: [...(s.recurrings ?? []), rec] }));
  await runWrite({ kind: "recurring.add", recurring: rec }, {
    rollback: () => set((s) => ({ recurrings: s.recurrings?.filter((x) => x.id !== rec.id) })),
    label: "recurring expense",
  });
}

export async function updateRecurring(id: string, patch: Partial<Omit<Recurring, "id">>): Promise<void> {
  const prev = get().recurrings?.find((r) => r.id === id);
  set((s) => ({ recurrings: s.recurrings?.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  await runWrite({ kind: "recurring.update", id, patch }, {
    rollback: () =>
      prev &&
      set((s) => ({ recurrings: s.recurrings?.map((r) => (r.id === id ? prev : r)) })),
    label: "recurring expense",
  });
}

export async function deleteRecurring(id: string): Promise<void> {
  const prev = get().recurrings?.find((r) => r.id === id);
  set((s) => ({ recurrings: s.recurrings?.filter((r) => r.id !== id) }));
  await runWrite({ kind: "recurring.delete", id }, {
    rollback: () => prev && set((s) => ({ recurrings: [...(s.recurrings ?? []), prev] })),
    label: "recurring expense",
  });
}

/**
 * Auto-add due recurring expenses (deterministic per rule+month id → upsert is
 * race-safe across devices and safe offline).
 */
export async function runRecurringAutoAdd(): Promise<void> {
  const recurrings = get().recurrings;
  if (!recurrings?.length || recurringRun) return;
  recurringRun = (async () => {
    try {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      let added = false;
      for (const r of recurrings) {
        if (!r.active || r.lastRun === thisMonth || now.getDate() < r.day) continue;
        const date = `${thisMonth}-${String(Math.min(r.day, now.getDate())).padStart(2, "0")}`;
        await saveExpense({
          id: uuidFromSeed(`recgen:${r.id}:${thisMonth}`),
          amount: r.amount,
          note: r.name,
          categoryId: r.categoryId,
          date,
          time: "08:00",
          recurringId: r.id,
        });
        await updateRecurring(r.id, { lastRun: thisMonth });
        added = true;
      }
      if (added) await refreshCurrentRange(true);
    } finally {
      recurringRun = null;
    }
  })();
  await recurringRun;
}

// ---------------------------------------------------------------------------
// Settings passthrough (theme/currency persistence lives in store.ts)
// ---------------------------------------------------------------------------

export async function pushSettingsUpdate(patch: SettingsPatch): Promise<void> {
  await runWrite({ kind: "settings.update", patch }, { rollback: () => undefined, label: "setting" });
}

// ---------------------------------------------------------------------------
// Range loading / refresh
// ---------------------------------------------------------------------------

export async function loadRange(range: DateRange, opts: { force?: boolean } = {}): Promise<void> {
  const key = `${range.from}:${range.to}`;
  if (!opts.force && get().ranges[key]) return;
  set((s) => ({ loadingRange: s.ranges[key] ? s.loadingRange : key }));
  try {
    const rows = await repo.getExpenses(range);
    set((s) => ({ ranges: { ...s.ranges, [key]: rows }, loadingRange: null }));
  } catch (e) {
    set({ loadingRange: null });
    if (isNetworkError(e)) {
      pushToast({
        kind: "error",
        message: "You're offline — showing cached data",
        action: { label: "Retry", run: () => void loadRange(range, { force: true }) },
      });
    } else {
      pushToast({
        kind: "error",
        message: `Couldn't load expenses — ${e instanceof Error ? e.message : "error"}`,
        action: { label: "Retry", run: () => void loadRange(range, { force: true }) },
      });
    }
  }
}

export async function refreshCurrentRange(force = true): Promise<void> {
  await loadRange(currentRange(), { force });
}

/** Reload everything after bulk operations (import, demo seed, clear all). */
export async function refreshAllData(): Promise<void> {
  if (!get().userId || !get().booted) return;
  const [categories, recurrings] = await Promise.all([repo.getCategories(), repo.getRecurrings()]);
  set({ categories, recurrings, budgets: {} });
  await refreshCurrentRange(true);
}

/** Delete every expense/budget/recurring (cloud or local) + any queued writes. */
export async function clearAllData(): Promise<void> {
  const userId = get().userId;
  if (userId) await clearQueuedOps(userId);
  await repo.clearAll();
  await reloadPendingOps();
  await refreshAllData();
}

// ---------------------------------------------------------------------------
// Migration (legacy IndexedDB → Supabase)
// ---------------------------------------------------------------------------

async function checkMigration(): Promise<void> {
  if (!cloudEnabled || !get().userId) return;
  if (migrationState() !== "pending") return;
  set({ migration: { status: "checking", progress: "", error: null } });
  if (!(await hasLegacyData())) {
    set({ migration: { status: "idle", progress: "", error: null } });
    return;
  }
  set({ migration: { status: "prompt", progress: "", error: null } });
}

export async function startMigration(): Promise<void> {
  set((s) => ({ migration: { ...s.migration, status: "running", error: null } }));
  try {
    const count = await runMigration((p) => {
      const total = p.total > 0 ? ` (${p.done}/${p.total})` : "";
      set((s) => ({ migration: { ...s.migration, progress: `${p.step}${total}` } }));
    });
    markMigrationDone();
    set({ migration: { status: "idle", progress: "", error: null } });
    pushToast({ kind: "success", message: `Imported ${count} expense${count === 1 ? "" : "s"} to your account` });
    await refreshAllData();
  } catch (e) {
    set((s) => ({
      migration: {
        ...s.migration,
        status: "prompt",
        error: e instanceof Error ? e.message : "Import failed",
      },
    }));
  }
}

export function dismissMigration(): void {
  markMigrationDismissed();
  set({ migration: { status: "idle", progress: "", error: null } });
}
