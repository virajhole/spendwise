import { expect, type Page } from "@playwright/test";

/** Add through the mobile details sheet. */
export async function addExpense(page: Page, digits: string, note: string, category?: string) {
  await page.getByRole("button", { name: "Add details" }).click();
  const sheet = page.getByRole("dialog", { name: "Add an expense" });
  await sheet.getByLabel(/Amount/).fill(digits);
  await sheet.getByLabel("What was it for?").fill(note);
  if (category) {
    const option = sheet.getByLabel("Category").getByRole("option", { name: new RegExp(category) });
    await sheet.getByLabel("Category").selectOption(await option.getAttribute("value") ?? "");
  }
  await sheet.getByRole("button", { name: "Save expense" }).click();
  await expect(sheet).toBeHidden();
  // Keep success notifications from covering controls in follow-up assertions.
  const dismiss = page.getByRole("button", { name: "Dismiss", exact: true });
  await expect(dismiss).toHaveCount(1);
  await dismiss.click();
  await expect(dismiss).toHaveCount(0);
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
  await expect(page.getByRole("region", { name: "Monthly summary" })).toBeVisible();
  await expect(page.getByLabel("Quick expense")).toBeVisible();
}
