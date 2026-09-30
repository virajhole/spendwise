import {
  db,
  DEFAULT_CATEGORIES,
  type Category,
  type Recurring,
  type Transaction,
} from "./db";
import { repo } from "./repo";

/** Removes previously seeded demo rows so re-seeding never duplicates. */
async function clearDemoRows() {
  const demoTxs = await db.transactions.filter((t) => t.id.startsWith("demo-")).primaryKeys();
  if (demoTxs.length) await db.transactions.bulkDelete(demoTxs);
  const demoRecs = await db.recurrings.filter((r) => r.id.startsWith("demo-")).primaryKeys();
  if (demoRecs.length) await db.recurrings.bulkDelete(demoRecs);
}

/** Generates demo transactions, budgets and recurring rules for UI preview. Idempotent. */
export async function seedDemoData(): Promise<void> {
  await db.transaction("rw", [db.transactions, db.budgets, db.recurrings, db.categories], async () => {
    const count = await db.categories.count();
    if (count === 0) await db.categories.bulkPut(DEFAULT_CATEGORIES);
    await clearDemoRows();

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    // Budgets: current + previous month
    const mkMonth = (mo: number) => `${y}-${String(mo + 1).padStart(2, "0")}`;
    await db.budgets.bulkPut([
      { month: mkMonth(m), amount: 20000 },
      { month: mkMonth((m + 11) % 12), amount: 18000 },
    ]);

    const recurring: Recurring = {
      id: "demo-recurring-rent", // fixed id → re-seeding replaces, never duplicates
      name: "Monthly rent",
      amount: 8000,
      categoryId: "bills",
      day: 1,
      lastRun: "",
      active: true,
    };
    await db.recurrings.put(recurring);

    const notes: [string, string, number][] = [
      ["Ice cream", "food", 80],
      ["Auto to office", "travel", 60],
      ["Coffee", "food", 45],
      ["Groceries — veggies", "food", 640],
      ["Netflix", "fun", 199],
      ["Electricity bill", "bills", 1200],
      ["Medicines", "health", 340],
      ["T-shirt", "shopping", 899],
      ["Bus pass", "travel", 500],
      ["Movie tickets", "fun", 480],
      ["Phone recharge", "bills", 299],
      ["Dinner out", "food", 750],
    ];

    const txs: Transaction[] = [];
    // current month: spread across days up to today
    for (let i = 0; i < 14; i++) {
      const [note, catId, amount] = notes[i % notes.length];
      const d = new Date(y, m, Math.max(1, now.getDate() - (i % Math.max(1, now.getDate()))));
      const date = `${y}-${String(m + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const created = new Date(y, m, d.getDate(), 9 + (i % 12), (i * 7) % 60);
      txs.push({
        id: `demo-${date}-${i}`,
        amount: amount + (i % 4) * 20,
        note,
        categoryId: catId,
        date,
        time: `${String(created.getHours()).padStart(2, "0")}:${String(created.getMinutes()).padStart(2, "0")}`,
        createdAt: created.getTime(),
      });
    }
    // previous month for month-switcher preview
    const pm = (m + 11) % 12;
    const py = pm > m ? y - 1 : y;
    for (let i = 0; i < 10; i++) {
      const [note, catId, amount] = notes[(i + 3) % notes.length];
      const date = `${py}-${String(pm + 1).padStart(2, "0")}-${String(3 + i * 2).padStart(2, "0")}`;
      const created = new Date(py, pm, 3 + i * 2, 10 + (i % 9), 15);
      txs.push({
        id: `demo-${date}-${i}`,
        amount,
        note,
        categoryId: catId,
        date,
        time: `${String(created.getHours()).padStart(2, "0")}:${String(created.getMinutes()).padStart(2, "0")}`,
        createdAt: created.getTime(),
      });
    }
    await db.transactions.bulkPut(txs);
  });
}

export async function loadOrInitCategories(): Promise<Category[]> {
  await repo.ensureDefaults();
  return db.categories.orderBy("name").toArray();
}

export async function applyRecurrings(list: Recurring[]): Promise<void> {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  for (const r of list) {
    if (!r.active) continue;
    if (r.lastRun === thisMonth) continue;
    if (now.getDate() < r.day) continue;
    const tx: Transaction = {
      id: `rec-${r.id}-${thisMonth}`, // deterministic per rule+month → race-safe
      amount: r.amount,
      note: r.name,
      categoryId: r.categoryId,
      date: `${thisMonth}-${String(Math.min(r.day, now.getDate())).padStart(2, "0")}`,
      time: "08:00",
      createdAt: Date.now(),
      recurringId: r.id,
    };
    await db.transactions.put(tx);
    await db.recurrings.update(r.id, { lastRun: thisMonth });
  }
}
