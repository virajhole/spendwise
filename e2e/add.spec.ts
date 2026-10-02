import { test, expect } from "@playwright/test";
import { addExpense, expectTotals, waitForApp } from "./helpers";

test.describe("Add expense", () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test("adds an expense with amount, note and category; totals update instantly", async ({ page }) => {
    await addExpense(page, "1250", "Chai", "Food");
    await expect(page.getByText("Chai")).toBeVisible();
    await expectTotals(page, "₹1,250", "-₹1,250"); // no budget set yet
  });

  test("rejects an empty amount (error state, nothing saved)", async ({ page }) => {
    await page.getByRole("button", { name: /tap to open keypad/i }).click();
    await page.getByRole("group", { name: "Keypad" }).getByRole("button", { name: "Add expense" }).click();
    await expect(page.getByRole("button", { name: /amount ₹0/i })).toHaveClass(/bg-red-500/);
  });

  test("rejects a leading zero as the only digit (0 is not a valid expense)", async ({ page }) => {
    await addExpense(page, "0", "nothing");
    await expect(page.getByRole("button", { name: /amount ₹0/i })).toHaveClass(/bg-red-500/);
    await expect(page.getByText("nothing")).toHaveCount(0);
  });

  test("keeps the pad clean after adding", async ({ page }) => {
    await addExpense(page, "1250", "Chai");
    await expect(page.getByRole("button", { name: /amount ₹0/i })).toBeVisible();
    await expect(page.getByLabel("Note")).toHaveValue("");
  });

  test("persists after reload", async ({ page }) => {
    await addExpense(page, "1250", "Chai");
    await page.reload();
    await waitForApp(page);
    await expect(page.getByText("Chai")).toBeVisible();
    await expectTotals(page, "₹1,250", "-₹1,250");
  });
});
