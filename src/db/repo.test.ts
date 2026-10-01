import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseRepository,
  applyQueuedOp,
} from "./supabaseRepo";
import { createDexieRepository } from "./dexieRepo";
import { clearOps, enqueueOp, flushOps, getPendingOps } from "./queue";
import {
  dayStartISO,
  DEFAULT_CATEGORIES,
  isUuid,
  rowToExpense,
  uuidFromSeed,
  validateExpenseInput,
  dateTimeToISO,
  isoToDate,
  isoToTime,
  expenseToRow,
  type ExpenseRow,
  type QueuedOp,
  type Transaction,
} from "./types";

// ---------------------------------------------------------------------------
// Test doubles: a chainable fake of the supabase-js PostgREST builder
// ---------------------------------------------------------------------------

interface QueryCall {
  table: string;
  method: "select" | "insert" | "upsert" | "update" | "delete";
  filters: { op: string; column: string; value: unknown }[];
  payload?: unknown;
  upsertOpts?: { onConflict?: string };
  order?: { column: string; ascending: boolean };
  limit?: number;
}

type Responder = (call: QueryCall) => { data: unknown; error: { message: string } | null };

function createFakeClient(respond: Responder): { client: SupabaseClient; calls: QueryCall[] } {
  const calls: QueryCall[] = [];

  function makeBuilder(table: string, method: QueryCall["method"]): Record<string, unknown> {
    const state: QueryCall = { table, method, filters: [] };
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters.push({ op: "eq", column, value });
        return builder;
      },
      gte(column: string, value: unknown) {
        state.filters.push({ op: "gte", column, value });
        return builder;
      },
      lt(column: string, value: unknown) {
        state.filters.push({ op: "lt", column, value });
        return builder;
      },
      in(column: string, value: unknown) {
        state.filters.push({ op: "in", column, value });
        return builder;
      },
      not(column: string, op: string, value: unknown) {
        state.filters.push({ op: `not.${op}`, column, value });
        return builder;
      },
      order(column: string, opts: { ascending?: boolean }) {
        state.order = { column, ascending: opts?.ascending ?? true };
        return builder;
      },
      limit(n: number) {
        state.limit = n;
        return builder;
      },
      range() {
        return builder;
      },
      maybeSingle() {
        return builder;
      },
      single() {
        return builder;
      },
      upsert(payload: unknown, opts?: { onConflict?: string }) {
        state.payload = payload;
        state.upsertOpts = opts;
        return builder;
      },
      insert(payload: unknown) {
        state.payload = payload;
        return builder;
      },
      update(payload: unknown) {
        state.payload = payload;
        return builder;
      },
      delete() {
        return builder;
      },
      throwOnError() {
        return builder;
      },
      then(resolve: (r: { data: unknown; error: { message: string } | null }) => unknown) {
        calls.push(state);
        return resolve(respond(state));
      },
    };
    return builder;
  }

  const client = {
    from(table: string) {
      return {
        // method is decided by the terminal verb; the builder starts as a
        // select and is mutated in place by upsert/update/delete/insert.
        ...makeBuilder(table, "select"),
      };
    },
    auth: {
      async getUser() {
        return { data: { user: { id: "user-1" } }, error: null };
      },
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

const makeTx = (over: Partial<Transaction> = {}): Transaction => ({
  id: "11111111-1111-4111-8111-111111111111",
  amount: 42,
  note: "Coffee",
  categoryId: DEFAULT_CATEGORIES[0].id,
  date: "2026-10-02",
  time: "09:30",
  createdAt: 1_785_000_000_000,
  ...over,
});

const makeRow = (tx: Transaction): ExpenseRow => ({
  id: tx.id,
  user_id: "user-1",
  amount: String(tx.amount),
  note: tx.note || null,
  category_id: tx.categoryId || null,
  recurring_id: tx.recurringId ?? null,
  spent_at: dateTimeToISO(tx.date, tx.time),
  created_at: new Date(tx.createdAt).toISOString(),
  updated_at: new Date(tx.createdAt).toISOString(),
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("uuidFromSeed", () => {
  it("is deterministic and differs per seed", () => {
    expect(uuidFromSeed("cat:Food")).toBe(uuidFromSeed("cat:Food"));
    expect(uuidFromSeed("cat:Food")).not.toBe(uuidFromSeed("cat:Travel"));
  });

  it("produces valid UUID-shaped ids", () => {
    for (const c of DEFAULT_CATEGORIES) expect(isUuid(c.id)).toBe(true);
  });
});

describe("validateExpenseInput", () => {
  it("rejects non-positive amounts", () => {
    expect(() => validateExpenseInput({ amount: 0 })).toThrow(/greater than 0/);
    expect(() => validateExpenseInput({ amount: -5 })).toThrow(/greater than 0/);
    expect(() => validateExpenseInput({ amount: NaN })).toThrow(/greater than 0/);
  });

  it("rejects over-long notes", () => {
    expect(() => validateExpenseInput({ amount: 1, note: "x".repeat(201) })).toThrow(/Note/);
    expect(() => validateExpenseInput({ amount: 1, note: "x".repeat(200) })).not.toThrow();
  });

  it("accepts valid input", () => {
    expect(() => validateExpenseInput({ amount: 10.5, note: "ok" })).not.toThrow();
  });
});

describe("date mapping", () => {
  it("round-trips local date+time through ISO", () => {
    const iso = dateTimeToISO("2026-10-02", "09:30");
    expect(isoToDate(iso)).toBe("2026-10-02");
    expect(isoToTime(iso)).toBe("09:30");
  });

  it("dayStartISO yields the ISO boundary of a local day", () => {
    const iso = dayStartISO("2026-10-02");
    expect(isoToDate(iso)).toBe("2026-10-02");
    expect(isoToTime(iso)).toBe("00:00");
  });
});

describe("row mapping", () => {
  it("maps numeric-string amounts and nulls", () => {
    const tx = rowToExpense({
      ...makeRow(makeTx({ note: "" })),
      amount: "1234.50",
      note: null,
      category_id: null,
    });
    expect(tx.amount).toBe(1234.5);
    expect(tx.note).toBe("");
    expect(tx.categoryId).toBe("");
  });

  it("expense→row→expense keeps amount/date/time stable", () => {
    const tx = makeTx({ amount: 99.99 });
    const back = rowToExpense({ ...makeRow(tx), ...expenseToRow(tx), user_id: "user-1", updated_at: "x" } as ExpenseRow);
    expect(back.amount).toBe(99.99);
    expect(back.date).toBe(tx.date);
    expect(back.time).toBe(tx.time);
  });
});

// ---------------------------------------------------------------------------
// Supabase repository (mocked client)
// ---------------------------------------------------------------------------

describe("supabase repository", () => {
  it("getExpenses filters by spent_at range and maps rows", async () => {
    const tx = makeTx();
    const { client, calls } = createFakeClient(() => ({ data: [makeRow(tx)], error: null }));
    const repo = createSupabaseRepository(client);

    const rows = await repo.getExpenses({ from: "2026-10-01", to: "2026-10-31" });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(tx.id);

    const call = calls[0];
    expect(call.table).toBe("expenses");
    const gte = call.filters.find((f) => f.op === "gte");
    const lt = call.filters.find((f) => f.op === "lt");
    expect(gte?.column).toBe("spent_at");
    expect(lt?.column).toBe("spent_at");
    // Range bounds are ISO instants of the local month boundaries.
    expect(isoToDate(String(gte?.value))).toBe("2026-10-01");
    expect(isoToDate(String(lt?.value))).toBe("2026-11-01");
  });

  it("addExpense upserts a mapped row without user_id", async () => {
    const tx = makeTx();
    const { client, calls } = createFakeClient(() => ({ data: null, error: null }));
    const repo = createSupabaseRepository(client);

    await repo.addExpense(tx);
    const call = calls[0];
    expect(call.table).toBe("expenses");
    const payload = (call.payload as ExpenseRow[])[0];
    expect(payload.amount).toBe(tx.amount);
    expect(payload.note).toBe("Coffee");
    expect(payload.id).toBe(tx.id);
    expect("user_id" in payload).toBe(false); // DB defaults it to auth.uid()
    expect(isoToDate(payload.spent_at)).toBe(tx.date);
  });

  it("addExpense rejects invalid amounts client-side", async () => {
    const { client, calls } = createFakeClient(() => ({ data: null, error: null }));
    const repo = createSupabaseRepository(client);
    await expect(repo.addExpense(makeTx({ amount: 0 }))).rejects.toThrow(/greater than 0/);
    expect(calls).toHaveLength(0);
  });

  it("setBudget upserts on (user_id, month) with first-of-month date", async () => {
    const { client, calls } = createFakeClient(() => ({ data: null, error: null }));
    const repo = createSupabaseRepository(client);

    await repo.setBudget("2026-10", 20000);
    const call = calls[0];
    expect(call.table).toBe("budgets");
    expect(call.upsertOpts?.onConflict).toBe("user_id,month");
    expect((call.payload as { month: string }).month).toBe("2026-10-01");
  });

  it("getBudget falls back to the previous month", async () => {
    const { client } = createFakeClient((call) => {
      const months = (call.filters.find((f) => f.op === "in")?.value as string[]) ?? [];
      // Simulate: current month absent, previous month present.
      const prev = [...months].sort().at(-1) ?? "2026-09-01";
      return { data: [{ month: prev, amount: "15000" }], error: null };
    });
    const repo = createSupabaseRepository(client);
    expect(await repo.getBudget("2026-10")).toBe(15000);
  });

  it("getBudget returns undefined when nothing is set", async () => {
    const { client } = createFakeClient(() => ({ data: [], error: null }));
    const repo = createSupabaseRepository(client);
    expect(await repo.getBudget("2026-10")).toBeUndefined();
  });

  it("updateExpense maps date+time to spent_at", async () => {
    const { client, calls } = createFakeClient(() => ({ data: null, error: null }));
    const repo = createSupabaseRepository(client);

    await repo.updateExpense("abc", { date: "2026-10-05", time: "22:10", note: "Edited" });
    const payload = calls[0].payload as ExpenseRow;
    expect(payload.note).toBe("Edited");
    expect(isoToDate(payload.spent_at as unknown as string)).toBe("2026-10-05");
    expect(isoToTime(payload.spent_at as unknown as string)).toBe("22:10");
  });

  it("updateExpense refuses date without time", async () => {
    const { client } = createFakeClient(() => ({ data: null, error: null }));
    const repo = createSupabaseRepository(client);
    await expect(repo.updateExpense("abc", { date: "2026-10-05" })).rejects.toThrow(/together/);
  });

  it("getSettings maps an absent row to empty object", async () => {
    const { client } = createFakeClient(() => ({ data: null, error: null }));
    const repo = createSupabaseRepository(client);
    expect(await repo.getSettings()).toEqual({});
  });

  it("updateSettings includes the auth user id for the upsert", async () => {
    const { client, calls } = createFakeClient(() => ({ data: null, error: null }));
    const repo = createSupabaseRepository(client);
    await repo.updateSettings({ theme: "dark" });
    expect(calls[0].table).toBe("settings");
    expect(calls[0].upsertOpts?.onConflict).toBe("user_id");
    expect(calls[0].payload).toMatchObject({ user_id: "user-1", theme: "dark" });
  });

  it("surfaces PostgREST errors", async () => {
    const { client } = createFakeClient(() => ({ data: null, error: { message: "permission denied" } }));
    const repo = createSupabaseRepository(client);
    await expect(repo.getExpenses({ from: "2026-10-01", to: "2026-10-31" })).rejects.toThrow("permission denied");
  });

  it("applyQueuedOp replays an offline expense upsert", async () => {
    const tx = makeTx();
    const { client, calls } = createFakeClient(() => ({ data: null, error: null }));
    await applyQueuedOp(client, { kind: "expense.upsert", tx });
    expect(calls[0].table).toBe("expenses");
    expect((calls[0].payload as ExpenseRow).id).toBe(tx.id);
  });
});

// ---------------------------------------------------------------------------
// Offline queue
// ---------------------------------------------------------------------------

describe("offline queue", () => {
  beforeEach(async () => {
    await clearOps("user-1");
  });

  it("flushes queued ops in order and clears them", async () => {
    const applied: string[] = [];
    await enqueueOp("user-1", { kind: "expense.delete", id: "a" } as QueuedOp);
    await enqueueOp("user-1", { kind: "expense.delete", id: "b" } as QueuedOp);
    const res = await flushOps("user-1", async (op) => {
      applied.push(op.kind === "expense.delete" ? op.id : op.kind);
    });
    expect(res).toEqual({ synced: 2, offline: false, failed: 0 });
    expect(applied).toEqual(["a", "b"]);
    expect(await getPendingOps("user-1")).toHaveLength(0);
  });

  it("stops on network errors and keeps ops queued", async () => {
    await enqueueOp("user-1", { kind: "expense.delete", id: "a" } as QueuedOp);
    await enqueueOp("user-1", { kind: "expense.delete", id: "b" } as QueuedOp);
    const res = await flushOps("user-1", async (op) => {
      if (op.kind === "expense.delete" && op.id === "a") throw new TypeError("Failed to fetch");
    });
    expect(res.offline).toBe(true);
    const remaining = await getPendingOps("user-1");
    // "a" always remains queued; "b" synced only if attempted before "a".
    expect(remaining.map((r) => (r.op as { id: string }).id)).toContain("a");
    expect(res.synced + remaining.length).toBe(2);
  });

  it("drops permanently failing ops after 5 attempts but continues", async () => {
    await enqueueOp("user-1", { kind: "expense.delete", id: "poison" } as QueuedOp);
    await enqueueOp("user-1", { kind: "expense.delete", id: "good" } as QueuedOp);
    const poison = (op: QueuedOp) => op.kind === "expense.delete" && op.id === "poison";
    // 4 attempts: poison stays queued (attempts 1..4), good syncs on pass 1
    for (let i = 0; i < 4; i++) {
      const res = await flushOps("user-1", async (op) => {
        if (poison(op)) throw new Error("check constraint");
      });
      if (i === 0) expect(res.synced).toBe(1);
    }
    let remaining = await getPendingOps("user-1");
    expect(remaining).toHaveLength(1); // only the poison op remains

    // 5th attempt: poison dropped, nothing else left to do
    const res = await flushOps("user-1", async (op) => {
      if (poison(op)) throw new Error("check constraint");
    });
    expect(res.synced).toBe(0);
    remaining = await getPendingOps("user-1");
    expect(remaining).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Dexie (local) repository — same interface, IndexedDB backend
// ---------------------------------------------------------------------------

describe("dexie repository", () => {
  it("stores and ranges expenses", async () => {
    const repo = createDexieRepository();
    const tx = makeTx({ id: uuidFromSeed("test:1") });
    await repo.addExpense(tx);
    const october = await repo.getExpenses({ from: "2026-10-01", to: "2026-10-31" });
    expect(october.map((t) => t.id)).toContain(tx.id);
    const november = await repo.getExpenses({ from: "2026-11-01", to: "2026-11-30" });
    expect(november).toHaveLength(0);
    await repo.deleteExpense(tx.id);
    expect(await repo.getExpenses({ from: "2026-10-01", to: "2026-10-31" })).toHaveLength(0);
  });

  it("falls back to last month's budget", async () => {
    const repo = createDexieRepository();
    await repo.setBudget("2026-09", 15000);
    expect(await repo.getBudget("2026-10")).toBe(15000);
    expect(await repo.getBudget("2026-11")).toBeUndefined();
  });

  it("validates amounts like the cloud repo", async () => {
    const repo = createDexieRepository();
    await expect(repo.addExpense(makeTx({ amount: -1 }))).rejects.toThrow(/greater than 0/);
  });
});
