/**
 * Domain types + the single repository interface that ALL persistence goes
 * through. Components never import Supabase (or Dexie) directly — they call
 * `repo` (src/db/repo.ts) or the zustand data hooks (src/store/data.ts).
 */

export interface Category {
  id: string;
  name: string;
  icon: string; // emoji
  color: string; // hex
  custom?: boolean;
}

export interface Transaction {
  id: string;
  amount: number; // always positive
  note: string;
  categoryId: string;
  date: string; // "YYYY-MM-DD" (local)
  time: string; // "HH:mm" (local)
  createdAt: number; // epoch ms
  recurringId?: string;
}

export interface Budget {
  month: string; // "YYYY-MM"
  amount: number;
}

export interface Recurring {
  id: string;
  name: string;
  amount: number;
  categoryId: string;
  day: number; // day of month 1-28
  lastRun: string; // "YYYY-MM" of the last month the rule was applied ("" = never)
  active: boolean;
}

export type ThemeValue = "light" | "dark" | "system";
export interface SettingsPatch {
  currency?: string;
  theme?: ThemeValue;
}
export type ExpensePatch = Partial<Omit<Transaction, "id">>;

/** Inclusive local date range, "YYYY-MM-DD" bounds. */
export interface DateRange {
  from: string;
  to: string;
}

export interface Backup {
  version: 1;
  exportedAt: string;
  transactions: Transaction[];
  budgets: Budget[];
  categories: Category[];
  recurrings: Recurring[];
  settings: { key: string; value: unknown }[];
}

// ---------------------------------------------------------------------------
// Validation (client-side; the DB re-enforces these via CHECK constraints)
// ---------------------------------------------------------------------------

export const NOTE_MAX_LENGTH = 200; // DB allows 500; UI caps tighter
export const MAX_AMOUNT = 99_999_999_999.99; // numeric(12,2)

export function validateExpenseInput(input: { amount: number; note?: string }): void {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }
  if (input.amount > MAX_AMOUNT) {
    throw new Error("Amount is too large");
  }
  if (input.note && input.note.length > NOTE_MAX_LENGTH) {
    throw new Error(`Note must be ${NOTE_MAX_LENGTH} characters or fewer`);
  }
}

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

/** Random UUID (falls back to a pseudo-random id where crypto.randomUUID is missing). */
export const uid = (): string =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * Deterministic UUID from a seed string. Used wherever the same logical row
 * must always produce the same id — default categories, recurring
 * auto-generated expenses, demo data and IndexedDB→Supabase migration — so
 * re-runs upsert instead of duplicating.
 */
export function uuidFromSeed(seed: string): string {
  const seedgen = xmur3(seed);
  const next = sfc32(seedgen(), seedgen(), seedgen(), seedgen());
  const hex = () => Math.floor(next() * 4294967296).toString(16).padStart(8, "0");
  const a = hex(), b = hex(), c = hex(), d = hex(), e = hex();
  return `${a.slice(0, 8)}-${b.slice(0, 4)}-4${b.slice(4, 7)}-${((parseInt(c[0], 16) & 0x3) | 0x8).toString(16)}${c.slice(1, 4)}-${d}${e.slice(0, 4)}`;
}

export function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// ---------------------------------------------------------------------------
// Default categories — deterministic ids so every device/user agrees on them
// ---------------------------------------------------------------------------

export const DEFAULT_CATEGORIES: Category[] = [
  { id: uuidFromSeed("cat:Food"), name: "Food", icon: "🍔", color: "#f97316" },
  { id: uuidFromSeed("cat:Travel"), name: "Travel", icon: "🚌", color: "#3b82f6" },
  { id: uuidFromSeed("cat:Shopping"), name: "Shopping", icon: "🛍️", color: "#ec4899" },
  { id: uuidFromSeed("cat:Bills"), name: "Bills", icon: "💡", color: "#eab308" },
  { id: uuidFromSeed("cat:Health"), name: "Health", icon: "🏥", color: "#22c55e" },
  { id: uuidFromSeed("cat:Fun"), name: "Fun", icon: "🎮", color: "#8b5cf6" },
  { id: uuidFromSeed("cat:Other"), name: "Other", icon: "📦", color: "#64748b" },
];

const DEFAULT_CATEGORY_IDS = new Set(DEFAULT_CATEGORIES.map((c) => c.id));

export function isDefaultCategoryId(id: string): boolean {
  return DEFAULT_CATEGORY_IDS.has(id);
}

/**
 * Map a legacy (IndexedDB-era) category id to its cloud id:
 * built-in categories map onto the deterministic default id (matched by
 * lowercase id/name), custom ones get a deterministic per-source id so
 * re-running a migration/import upserts instead of duplicating.
 */
export function mapLegacyCategoryId(legacyId: string, existingCloudIds: Set<string>): string {
  const lowered = legacyId.toLowerCase();
  const builtIn = DEFAULT_CATEGORIES.find(
    (c) => c.id.toLowerCase() === lowered || c.name.toLowerCase() === lowered,
  );
  if (builtIn) return builtIn.id;
  if (isUuid(legacyId) && existingCloudIds.has(legacyId)) return legacyId;
  return uuidFromSeed(`legacycat:${legacyId}`);
}

// ---------------------------------------------------------------------------
// Date/time helpers (local-time semantics; the DB stores timestamptz)
// ---------------------------------------------------------------------------

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "YYYY-MM-DD" + "HH:mm" (local) → ISO timestamptz string. */
export function dateTimeToISO(date: string, time: string): string {
  const d = new Date(`${date}T${time || "00:00"}:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date/time: ${date} ${time}`);
  return d.toISOString();
}

/** ISO timestamptz → local "YYYY-MM-DD". */
export function isoToDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** ISO timestamptz → local "HH:mm". */
export function isoToTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Start of a local day as ISO — used for spent_at range filters. */
export function dayStartISO(date: string): string {
  return dateTimeToISO(date, "00:00");
}

export function firstOfMonth(month: string): string {
  return `${month}-01`;
}

/** Last day of "YYYY-MM" as a "YYYY-MM-DD" string. */
export function monthEndDate(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${pad2(new Date(y, m, 0).getDate())}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function inRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

export function rangeKey(range: DateRange): string {
  return `${range.from}:${range.to}`;
}

// ---------------------------------------------------------------------------
// Supabase row types + mappers
// ---------------------------------------------------------------------------

export interface ExpenseRow {
  id: string;
  user_id: string;
  amount: number | string; // PostgREST returns numeric as string
  note: string | null;
  category_id: string | null;
  recurring_id: string | null;
  spent_at: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryRow {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
}

export interface BudgetRow {
  id: string;
  user_id: string;
  month: string; // "YYYY-MM-01"
  amount: number | string;
}

export interface RecurringRow {
  id: string;
  user_id: string;
  amount: number | string;
  note: string | null; // the recurring's display name
  category_id: string | null;
  day_of_month: number;
  active: boolean;
  last_run: string | null;
  created_at: string;
}

export interface SettingsRow {
  user_id: string;
  currency: string;
  theme: ThemeValue;
}

const num = (v: number | string | null | undefined): number =>
  v === null || v === undefined ? 0 : typeof v === "number" ? v : Number(v);

export function expenseToRow(t: Transaction): Omit<ExpenseRow, "user_id" | "updated_at"> {
  return {
    id: t.id,
    amount: t.amount,
    note: t.note || null,
    category_id: t.categoryId || null,
    recurring_id: t.recurringId ?? null,
    spent_at: dateTimeToISO(t.date, t.time),
    created_at: new Date(t.createdAt).toISOString(),
  };
}

export function rowToExpense(row: ExpenseRow): Transaction {
  return {
    id: row.id,
    amount: num(row.amount),
    note: row.note ?? "",
    categoryId: row.category_id ?? "",
    date: isoToDate(row.spent_at),
    time: isoToTime(row.spent_at),
    createdAt: Date.parse(row.created_at),
    recurringId: row.recurring_id ?? undefined,
  };
}

export function patchToExpenseRow(patch: ExpensePatch): Partial<ExpenseRow> {
  const row: Partial<ExpenseRow> = {};
  if (patch.amount !== undefined) {
    validateExpenseInput({ amount: patch.amount });
    row.amount = patch.amount;
  }
  if (patch.note !== undefined) row.note = patch.note || null;
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId || null;
  if (patch.recurringId !== undefined) row.recurring_id = patch.recurringId ?? null;
  if (patch.date !== undefined || patch.time !== undefined) {
    if (!patch.date || !patch.time) throw new Error("Date and time must be updated together");
    row.spent_at = dateTimeToISO(patch.date, patch.time);
  }
  if (patch.createdAt !== undefined) row.created_at = new Date(patch.createdAt).toISOString();
  return row;
}

export function categoryToRow(c: Category): Omit<CategoryRow, "user_id" | "created_at"> {
  return { id: c.id, name: c.name, icon: c.icon, color: c.color };
}

export function rowToCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, icon: row.icon, color: row.color, custom: !isDefaultCategoryId(row.id) };
}

export function recurringToRow(r: Recurring): Omit<RecurringRow, "user_id" | "created_at"> {
  return {
    id: r.id,
    amount: r.amount,
    note: r.name,
    category_id: r.categoryId || null,
    day_of_month: r.day,
    active: r.active,
    last_run: r.lastRun ? `${r.lastRun}-01` : null,
  };
}

export function rowToRecurring(row: RecurringRow): Recurring {
  return {
    id: row.id,
    name: row.note ?? "",
    amount: num(row.amount),
    categoryId: row.category_id ?? "",
    day: row.day_of_month,
    lastRun: row.last_run ? row.last_run.slice(0, 7) : "",
    active: row.active,
  };
}

export function budgetToRow(month: string, amount: number): Omit<BudgetRow, "user_id" | "id"> {
  return { month: firstOfMonth(month), amount };
}

// ---------------------------------------------------------------------------
// Offline write queue
// ---------------------------------------------------------------------------

export type QueuedOp =
  | { kind: "expense.upsert"; tx: Transaction }
  | { kind: "expense.update"; id: string; patch: ExpensePatch }
  | { kind: "expense.delete"; id: string }
  | { kind: "budget.set"; month: string; amount: number }
  | { kind: "category.add"; category: Category }
  | { kind: "category.delete"; id: string }
  | { kind: "recurring.add"; recurring: Recurring }
  | { kind: "recurring.update"; id: string; patch: Partial<Omit<Recurring, "id">> }
  | { kind: "recurring.delete"; id: string }
  | { kind: "settings.update"; patch: SettingsPatch };

/** True when the error looks like "we couldn't reach the server at all". */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (e instanceof TypeError) return true; // fetch() failures throw TypeError
  const msg = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|network error|load failed|fetch failed|internet connection/i.test(msg);
}

// ---------------------------------------------------------------------------
// The repository interface
// ---------------------------------------------------------------------------

export interface DataRepository {
  /** "supabase" (cloud) or "local" (IndexedDB fallback when env vars are absent). */
  readonly kind: "supabase" | "local";

  // expenses
  getExpenses(range: DateRange): Promise<Transaction[]>;
  getAllExpenses(): Promise<Transaction[]>;
  /** Upsert semantics — idempotent by id (offline retries, recurring, demo data). */
  addExpense(t: Transaction): Promise<void>;
  updateExpense(id: string, patch: ExpensePatch): Promise<void>;
  deleteExpense(id: string): Promise<void>;

  // budgets
  /** Falls back to the previous month's budget when this month has none. */
  getBudget(month: string): Promise<number | undefined>;
  setBudget(month: string, amount: number): Promise<void>;

  // categories
  getCategories(): Promise<Category[]>;
  addCategory(name: string, icon: string, color: string, id?: string): Promise<Category>;
  deleteCategory(id: string): Promise<void>;

  // recurring expenses
  getRecurrings(): Promise<Recurring[]>;
  addRecurring(r: Omit<Recurring, "id" | "lastRun">, id?: string): Promise<Recurring>;
  updateRecurring(id: string, patch: Partial<Omit<Recurring, "id">>): Promise<void>;
  deleteRecurring(id: string): Promise<void>;

  // settings (theme + currency, synced to the cloud when available)
  getSettings(): Promise<SettingsPatch>;
  updateSettings(patch: SettingsPatch): Promise<void>;

  // misc
  ensureDefaults(): Promise<void>;
  exportAll(): Promise<Backup>;
  /** Merge-import a JSON backup; returns the number of expenses imported. */
  importAll(data: Backup): Promise<number>;
  /** Deletes expenses, budgets and recurring rules (categories/settings stay). */
  clearAll(): Promise<void>;
}
