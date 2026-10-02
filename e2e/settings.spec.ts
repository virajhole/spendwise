import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers";

test.describe("Theme, currency, export", () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test("theme cycles light → dark and persists after reload", async ({ page }) => {
    const themeBtn = page.getByRole("button", { name: /theme:/i });
    await themeBtn.click(); // system → light
    await expect(page.getByRole("button", { name: /theme: light/i })).toBeVisible();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await themeBtn.click(); // light → dark
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/); // persisted
  });

  test("currency change is reflected in the preview and persists", async ({ page }) => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
    await page.getByRole("button", { name: "$", exact: true }).click();
    await expect(page.getByText(/\$1,23,456/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/\$1,23,456/)).toBeVisible();
  });

  test("export CSV downloads a file", async ({ page }) => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export csv/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^expenses-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
