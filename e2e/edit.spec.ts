import { test, expect } from "@playwright/test";
import { addExpense, expectTotals, openEditSheet, waitForApp } from "./helpers";

test.describe("Edit expense", () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await addExpense(page, "125", "Tea", "Food");
    await openEditSheet(page, "Tea");
  });

  test("opens the sheet with the current values", async ({ page }) => {
    const sheet = page.getByRole("dialog", { name: /edit expense/i });
    await expect(sheet.locator("#edit-amount")).toHaveValue("125");
    await expect(sheet.locator("#edit-note")).toHaveValue("Tea");
    await expect(sheet.getByRole("radio", { name: /Food/i })).toHaveAttribute("aria-checked", "true");
    await expect(sheet.locator("#edit-date")).toHaveValue(/\d{4}-\d{2}-\d{2}/);
  });

  test("saves amount + note + category changes; list and totals update", async ({ page }) => {
    const sheet = page.getByRole("dialog", { name: /edit expense/i });
    await sheet.locator("#edit-amount").fill("200");
    await sheet.locator("#edit-note").fill("Masala chai");
    await sheet.getByRole("radio", { name: /Travel/i }).click();
    await sheet.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByRole("dialog", { name: /edit expense/i })).toBeHidden();
    await expect(page.getByText("Masala chai")).toBeVisible();
    await expectTotals(page, "₹200", "-₹200");
  });

  test("keeps the old amount when the new one is invalid", async ({ page }) => {
    const sheet = page.getByRole("dialog", { name: /edit expense/i });
    await sheet.locator("#edit-amount").fill("0");
    await sheet.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByText("Tea")).toBeVisible(); // amount kept at ₹125
    await expectTotals(page, "₹125", "-₹125");
  });

  test("change persists after reload", async ({ page }) => {
    const sheet = page.getByRole("dialog", { name: /edit expense/i });
    await sheet.locator("#edit-amount").fill("200");
    await sheet.locator("#edit-note").fill("Masala chai");
    await sheet.getByRole("button", { name: /save changes/i }).click();
    await page.reload();
    await waitForApp(page);
    await expect(page.getByText("Masala chai")).toBeVisible();
    await expectTotals(page, "₹200", "-₹200");
  });

  test("closes on cancel without saving", async ({ page }) => {
    const sheet = page.getByRole("dialog", { name: /edit expense/i });
    await sheet.locator("#edit-note").fill("should not save");
    await sheet.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog", { name: /edit expense/i })).toBeHidden();
    await expect(page.getByText("should not save")).toHaveCount(0);
  });

  test("deletes from the edit sheet", async ({ page }) => {
    const sheet = page.getByRole("dialog", { name: /edit expense/i });
    await sheet.getByRole("button", { name: /delete expense/i }).click();
    await expect(page.getByRole("dialog", { name: /edit expense/i })).toBeHidden();
    await expect(page.getByRole("button", { name: /edit tea/i })).toHaveCount(0);
  });
});
