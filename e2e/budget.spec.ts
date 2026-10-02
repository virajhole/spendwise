import { test, expect } from "@playwright/test";
import { addExpense, waitForApp } from "./helpers";

test.describe("Budget and months", () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await addExpense(page, "125", "Tea");
  });

  test("sets and changes the monthly budget", async ({ page }) => {
    await page.getByRole("button", { name: /monthly budget/i }).click();
    await page.getByLabel("Budget amount").fill("20000");
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByRole("button", { name: /monthly budget ₹20,000/i })).toBeVisible();
    await expect(page.getByText("1% used")).toBeVisible();

    // change it
    await page.getByRole("button", { name: /monthly budget/i }).click();
    await page.getByLabel("Budget amount").fill("500");
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByRole("button", { name: /monthly budget ₹500/i })).toBeVisible();
  });

  test("budgets are per month — other months start empty", async ({ page }) => {
    await page.getByRole("button", { name: /monthly budget/i }).click();
    await page.getByLabel("Budget amount").fill("20000");
    await page.getByRole("button", { name: /^save$/i }).click();

    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(page.getByRole("button", { name: /monthly budget ₹0/i })).toBeVisible();
    await expect(page.getByText("No budget set")).toBeVisible();

    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.getByRole("button", { name: /monthly budget ₹20,000/i })).toBeVisible();
  });

  test("expenses are per month — switching months hides them", async ({ page }) => {
    await expect(page.getByText("Tea")).toBeVisible();
    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(page.getByText("Tea")).toHaveCount(0);
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.getByText("Tea")).toBeVisible();
  });
});
