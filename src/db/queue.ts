import { db, type PendingWrite } from "./db";
import { uid, type ExpensePatch, type QueuedOp } from "./types";

/**
 * Durable offline write queue (IndexedDB/Dexie).
 *
 * Every optimistic write in cloud mode is enqueued BEFORE it is attempted, so
 * a crash / reload / offline spell never loses data. Flushing replays ops in
 * creation order; network errors stop the flush (ops stay queued) while
 * permanently failing ops are dropped after 5 attempts so one poison row
 * can't block the queue forever.
 */

export async function enqueueOp(userId: string, op: QueuedOp): Promise<string> {
  const row: PendingWrite = { id: uid(), userId, op, createdAt: Date.now(), attempts: 0 };
  await db.pendingWrites.put(row);
  return row.id;
}

export async function getPendingOps(userId: string): Promise<PendingWrite[]> {
  return db.pendingWrites.where("userId").equals(userId).sortBy("createdAt");
}

export async function removeOp(rowId: string): Promise<void> {
  await db.pendingWrites.delete(rowId);
}

export async function clearOps(userId: string): Promise<void> {
  await db.pendingWrites.where("userId").equals(userId).delete();
}

/** Merge a patch into queued writes for an entity so edits collapse into one op. */
export async function patchQueuedExpense(userId: string, entityId: string, patch: ExpensePatch): Promise<void> {
  const rows = await db.pendingWrites.where("userId").equals(userId).toArray();
  for (const row of rows) {
    if (row.op.kind === "expense.upsert" && row.op.tx.id === entityId) {
      row.op = { ...row.op, tx: { ...row.op.tx, ...patch } };
      await db.pendingWrites.put(row);
    } else if (row.op.kind === "expense.update" && row.op.id === entityId) {
      row.op = { ...row.op, patch: { ...row.op.patch, ...patch } };
      await db.pendingWrites.put(row);
    }
  }
}

/** Remove queued writes for an entity that was deleted before ever syncing. */
export async function dropQueuedExpense(userId: string, entityId: string): Promise<void> {
  const rows = await db.pendingWrites.where("userId").equals(userId).toArray();
  const doomed = rows
    .filter(
      (r) =>
        (r.op.kind === "expense.upsert" && r.op.tx.id === entityId) ||
        (r.op.kind === "expense.update" && r.op.id === entityId),
    )
    .map((r) => r.id);
  if (doomed.length) await db.pendingWrites.bulkDelete(doomed);
}

export interface FlushResult {
  synced: number;
  offline: boolean;
  failed: number;
}

export async function flushOps(
  userId: string,
  apply: (op: QueuedOp) => Promise<void>,
): Promise<FlushResult> {
  const rows = await getPendingOps(userId);
  let synced = 0;
  for (const row of rows) {
    try {
      await apply(row.op);
      await removeOp(row.id);
      synced++;
    } catch (e) {
      if (isNetworkError(e)) {
        return { synced, offline: true, failed: rows.length - synced };
      }
      const attempts = row.attempts + 1;
      if (attempts >= 5) await removeOp(row.id);
      else await db.pendingWrites.update(row.id, { attempts });
    }
  }
  return { synced, offline: false, failed: 0 };
}

/** Mirrors the network-error heuristic from types.ts (kept local to avoid a cycle). */
function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (e instanceof TypeError) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|network error|load failed|fetch failed|internet connection/i.test(msg);
}
