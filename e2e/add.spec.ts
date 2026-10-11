import { test, expect } from "@playwright/test";
import { addExpense, expectTotals, waitForApp } from "./helpers";

test.describe("Add expense", () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });
  test("adds an expense with amount, note and category", async ({ page }) => {
    await addExpense(page, "1250", "Chai", "Food");
    await expect(page.getByText("Chai", { exact: true })).toBeVisible();
    await expectTotals(page, "₹1,250", "-₹1,250");
  });
  test("rejects an empty or zero amount", async ({ page }) => {
    await page.getByRole("button", { name: "Add details" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Save expense" }).click();
    await expect(sheet).toBeVisible();
    await sheet.getByLabel(/Amount/).fill("0");
    await sheet.getByRole("button", { name: "Save expense" }).click();
    await expect(sheet).toBeVisible();
    expect(await sheet.getByLabel(/Amount/).evaluate((e: HTMLInputElement) => e.validity.valid)).toBe(false);
  });
  test("chat entry categorizes chai and persists after reload", async ({ page }) => {
    await page.getByLabel("Quick expense").fill("chai 15rs upi");
    await page.getByRole("button", { name: "Send expense" }).click();
    await expect(page.getByLabel("Quick expense")).toHaveValue("");
    await expectTotals(page, "₹15", "-₹15");
    await page.reload();
    await expect(page.getByRole("button", { name: /Edit chai,/ })).toBeVisible();
    await expectTotals(page, "₹15", "-₹15");
  });
  test("ambiguous chat does not create an expense", async ({ page }) => {
    await page.getByLabel("Quick expense").fill("chai 15 20");
    await page.getByRole("button", { name: "Send expense" }).click();
    await expect(page.getByRole("alert")).toContainText("Ek amount");
  });
  test("local mode: QuickEntry works with rule parser and no LLM UI appears", async ({ page }) => {
    // Verify AI enabled badge is NOT visible in local mode
    await expect(page.getByText("AI enabled")).toHaveCount(0);

    // Rule parser entry succeeds
    await page.getByLabel("Quick expense").fill("Burger King 173 SBI cc");
    await page.getByRole("button", { name: "Send expense" }).click();

    // No AI preview dialog appears
    await expect(page.getByText("AI Smart Entry")).toHaveCount(0);

    // Expense is saved directly
    await expect(page.getByLabel("Quick expense")).toHaveValue("");
    await expect(page.getByRole("button", { name: /Edit Burger King/ })).toBeVisible();
  });
});

