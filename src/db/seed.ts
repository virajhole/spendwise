import { repo } from "./repo";
import { uuidFromSeed, type Recurring, type Transaction } from "./types";

/**
 * Generates demo transactions, a budget and a recurring rule for UI preview.
 * Deterministic ids make it idempotent — safe to click repeatedly (values are
 * refreshed, never duplicated).
 */
export async function seedDemoData(): Promise<void> {
  await repo.ensureDefaults();
  const cats = await repo.getCategories();
  const catId = (legacy: string): string =>
    cats.find((c) => c.name.toLowerCase() === legacy)?.id ?? cats[0]?.id ?? "";

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  // Budgets: current + previous month
  const mkMonth = (mo: number) => `${y}-${String(mo + 1).padStart(2, "0")}`;
  await repo.setBudget(mkMonth(m), 20000);
  await repo.setBudget(mkMonth((m + 11) % 12), 18000);

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
    const [note, cat, amount] = notes[i % notes.length];
    const d = new Date(y, m, Math.max(1, now.getDate() - (i % Math.max(1, now.getDate()))));
    const date = `${y}-${String(m + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const created = new Date(y, m, d.getDate(), 9 + (i % 12), (i * 7) % 60);
    txs.push({
      id: uuidFromSeed(`demo:${date}:${i}`),
      amount: amount + (i % 4) * 20,
      note,
      categoryId: catId(cat),
      date,
      time: `${String(created.getHours()).padStart(2, "0")}:${String(created.getMinutes()).padStart(2, "0")}`,
      createdAt: created.getTime(),
    });
  }
  // previous month for month-switcher preview
  const pm = (m + 11) % 12;
  const py = pm > m ? y - 1 : y;
  for (let i = 0; i < 10; i++) {
    const [note, cat, amount] = notes[(i + 3) % notes.length];
    const date = `${py}-${String(pm + 1).padStart(2, "0")}-${String(3 + i * 2).padStart(2, "0")}`;
    const created = new Date(py, pm, 3 + i * 2, 10 + (i % 9), 15);
    txs.push({
      id: uuidFromSeed(`demo:${date}:${i}`),
      amount,
      note,
      categoryId: catId(cat),
      date,
      time: `${String(created.getHours()).padStart(2, "0")}:${String(created.getMinutes()).padStart(2, "0")}`,
      createdAt: created.getTime(),
    });
  }
  for (const tx of txs) await repo.addExpense(tx);

  const recurrings = await repo.getRecurrings();
  const existing = recurrings.find((r: Recurring) => r.name === "Monthly rent");
  if (existing) {
    await repo.updateRecurring(existing.id, {
      name: "Monthly rent",
      amount: 8000,
      categoryId: catId("bills"),
      day: 1,
      active: true,
    });
  } else {
    await repo.addRecurring({ name: "Monthly rent", amount: 8000, categoryId: catId("bills"), day: 1, active: true });
  }
}
