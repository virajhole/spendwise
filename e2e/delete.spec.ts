import { test, expect } from "@playwright/test";
import { addExpense, waitForApp } from "./helpers";

test.describe("Delete expense", () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await addExpense(page, "125", "Tea");
  });

  test("deletes with one tap on the trash icon, with undo", async ({ page }) => {
    await page.getByRole("button", { name: /delete tea/i }).click();
    await expect(page.getByRole("status")).toContainText("Deleted");
    await expect(page.getByRole("button", { name: /edit tea/i })).toHaveCount(0);
    // undo brings it back
    await page.getByRole("button", { name: /undo/i }).click();
    await expect(page.getByRole("button", { name: /edit tea/i })).toBeVisible();
  });

  test("delete is permanent after the undo window", async ({ page }) => {
    await page.getByRole("button", { name: /delete tea/i }).click();
    await expect(page.getByRole("button", { name: /edit tea/i })).toHaveCount(0);
    await page.waitForTimeout(5500); // let the toast expire
    await page.reload();
    await waitForApp(page);
    await expect(page.getByRole("button", { name: /edit tea/i })).toHaveCount(0);
  });

  test("trash tap never opens the edit sheet", async ({ page }) => {
    await page.getByRole("button", { name: /delete tea/i }).click();
    await expect(page.getByRole("dialog", { name: /edit expense/i })).toHaveCount(0);
  });
});
