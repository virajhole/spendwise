import { test, expect } from "@playwright/test";
import { addExpense, waitForApp } from "./helpers";

test.describe("Search and filters", () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await addExpense(page, "15", "Tea");
    await addExpense(page, "28", "Rapido");
    await addExpense(page, "500", "Netflix");
  });

  test("search filters rows, shows count and total, and highlights", async ({ page }) => {
    await page.getByLabel("Search transactions").fill("tea");
    await expect(page.getByText("Tea")).toBeVisible();
    await expect(page.getByText("Rapido")).toBeHidden();
    await expect(page.getByText(/1 result/i)).toBeVisible();
    // highlight
    await expect(page.locator("mark.hl").first()).toHaveText(/tea/i);
  });

  test("clear button resets the search", async ({ page }) => {
    await page.getByLabel("Search transactions").fill("tea");
    await page.getByRole("button", { name: /clear search/i }).click();
    await expect(page.getByText("Rapido")).toBeVisible();
    await expect(page.getByLabel("Search transactions")).toHaveValue("");
  });

  test("category filter via the filter panel", async ({ page }) => {
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByRole("button", { name: /Food/i }).first().click();
    await expect(page.getByText("Tea")).toBeVisible();
    await expect(page.getByText("Rapido")).toBeHidden();
    // removable chip
    await page.getByRole("button", { name: /remove filter/i }).first().click();
    await expect(page.getByText("Rapido")).toBeVisible();
  });

  test("amount range filter", async ({ page }) => {
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByLabel("Minimum amount").fill("100");
    await expect(page.getByText("Netflix")).toBeVisible();
    await expect(page.getByText("Tea")).toBeHidden();
  });

  test("no results shows a friendly empty state", async ({ page }) => {
    await page.getByLabel("Search transactions").fill("zzzz");
    await expect(page.getByText(/no matching expenses/i)).toBeVisible();
  });
});
