/**
 * The repository facade — THE one persistence boundary of the app.
 *
 * Components and hooks import `repo` (and the queue helpers) from here and
 * never touch Supabase or Dexie directly. When Supabase env vars are present
 * the Supabase implementation is used; otherwise the app transparently falls
 * back to the IndexedDB (Dexie) implementation so a fresh clone still runs.
 */
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { applyQueuedOp, createSupabaseRepository } from "./supabaseRepo";
import { createDexieRepository } from "./dexieRepo";
import * as queue from "./queue";
import type { QueuedOp } from "./types";

export * from "./types";
export { flushOps, getPendingOps, type FlushResult } from "./queue";

export const cloudEnabled = isSupabaseConfigured;

export const repo = isSupabaseConfigured ? createSupabaseRepository(supabase) : createDexieRepository();

/** Apply a write op now (used by optimistic writes and the offline flush). */
export function applyOp(op: QueuedOp): Promise<void> {
  return isSupabaseConfigured ? applyQueuedOp(supabase, op) : applyOpLocal(op);
}

/** Local mode has no queue — ops map straight onto repo calls. */
function applyOpLocal(op: QueuedOp): Promise<void> {
  switch (op.kind) {
    case "expense.upsert":
      return repo.addExpense(op.tx);
    case "expense.update":
      return repo.updateExpense(op.id, op.patch);
    case "expense.delete":
      return repo.deleteExpense(op.id);
    case "budget.set":
      return repo.setBudget(op.month, op.amount);
    case "category.add":
      return repo.addCategory(op.category.name, op.category.icon, op.category.color, op.category.id).then(() => undefined);
    case "category.delete":
      return repo.deleteCategory(op.id);
    case "recurring.add":
      return repo.addRecurring(op.recurring, op.recurring.id).then(() => undefined);
    case "recurring.update":
      return repo.updateRecurring(op.id, op.patch);
    case "recurring.delete":
      return repo.deleteRecurring(op.id);
    case "settings.update":
      return repo.updateSettings(op.patch);
  }
}

// ---------------------------------------------------------------------------
// Offline queue helpers (no-ops in local mode, where writes are instant)
// ---------------------------------------------------------------------------

export function enqueueOp(userId: string, op: QueuedOp): Promise<string> {
  return isSupabaseConfigured ? queue.enqueueOp(userId, op) : Promise.resolve("");
}

export function loadPendingOps(userId: string) {
  return isSupabaseConfigured ? queue.getPendingOps(userId) : Promise.resolve([]);
}

export function removeQueuedOp(rowId: string): Promise<void> {
  return queue.removeOp(rowId);
}

export function patchQueuedExpense(userId: string, entityId: string, patch: import("./types").ExpensePatch): Promise<void> {
  return isSupabaseConfigured ? queue.patchQueuedExpense(userId, entityId, patch) : Promise.resolve();
}

export function dropQueuedExpense(userId: string, entityId: string): Promise<void> {
  return isSupabaseConfigured ? queue.dropQueuedExpense(userId, entityId) : Promise.resolve();
}

export function clearQueuedOps(userId: string): Promise<void> {
  return isSupabaseConfigured ? queue.clearOps(userId) : Promise.resolve();
}

/** Replay every queued write against Supabase; safe to call repeatedly. */
export function flushQueue(userId: string): Promise<queue.FlushResult> {
  if (!isSupabaseConfigured) return Promise.resolve({ synced: 0, offline: true, failed: 0 });
  return queue.flushOps(userId, (op) => applyQueuedOp(supabase, op));
}
