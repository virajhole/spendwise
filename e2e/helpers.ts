import { expect, type Page } from "@playwright/test";

/** Open the keypad (if collapsed) and type an amount digit by digit. */
export async function typeAmount(page: Page, digits: string) {
  const collapsed = await page.getByRole("button", { name: /tap to open keypad/i }).count();
  if (collapsed) await page.getByRole("button", { name: /tap to open keypad/i }).click();
  for (const d of digits) {
    if (d === ".") continue; // no decimals in the keypad
    await page.getByRole("button", { name: `Key ${d}`, exact: true }).click();
  }
}

/** Add an expense end-to-end: amount → note → category → submit. */
export async function addExpense(page: Page, digits: string, note: string, category?: string) {
  await typeAmount(page, digits);
  if (note) await page.getByLabel("Note").fill(note);
  if (category) await page.getByRole("radio", { name: new RegExp(category, "i") }).click();
  // Exactly one "Add expense" button is visible in every dock state.
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`Amount .*tap to`, "i") })).toBeVisible();
}

export async function openEditSheet(page: Page, note: string) {
  await page.getByRole("button", { name: new RegExp(`edit ${note}`, "i") }).click();
  await expect(page.getByRole("dialog", { name: /edit expense/i })).toBeVisible();
}

export function summary(page: Page) {
  return page.getByRole("region", { name: /monthly summary/i });
}

export async function expectTotals(page: Page, total: string, remaining: string) {
  await expect(summary(page).getByText(total, { exact: true })).toBeVisible();
  await expect(summary(page).getByText(remaining, { exact: true })).toBeVisible();
}

export async function waitForApp(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SpendWise" })).toBeVisible();
  await expect(page.getByRole("button", { name: /amount .*tap to/i })).toBeVisible();
}
