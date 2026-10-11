import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers";

test("wallet filters history by card and payment method, including card repayments", async ({ page }) => {
  await waitForApp(page);
  for (const text of ["dinner 300 SBI cc", "shopping 700 HDFC cc", "chai 20 cash", "auto 80 UPI"]) {
    await page.getByLabel("Quick expense").fill(text);
    await page.getByRole("button", { name: "Send expense" }).click();
    await expect(page.getByLabel("Quick expense")).toHaveValue("");
  }
  await page.getByRole("navigation").getByRole("link", { name: "Wallet", exact: true }).click();
  const sbi = page.locator(".wallet-card").filter({ has: page.getByRole("button", { name: "View SBI transactions" }) });
  await sbi.getByRole("button", { name: "Record bill payment" }).click();
  let sheet = page.getByRole("dialog");
  await sheet.getByLabel(/Amount/).fill("100");
  await sheet.getByRole("button", { name: "Save payment" }).click();
  await expect(sheet).toBeHidden();
  for (const [name, count, included, excluded] of [
    ["SBI", 2, "dinner", "shopping"], ["HDFC", 1, "shopping", "dinner"],
    ["Cash", 1, "chai", "auto"], ["UPI", 2, "auto", "dinner"],
    ["Credit card", 2, "shopping", "Card payment"],
  ] as const) {
    await page.getByRole("button", { name: `View ${name} transactions`, exact: true }).click();
    sheet = page.getByRole("dialog", { name: `${name} transactions` });
    await expect(sheet.locator("article")).toHaveCount(count);
    await expect(sheet).toContainText(included);
    await expect(sheet.locator("article").filter({ hasText: excluded })).toHaveCount(0);
    await sheet.getByLabel("From date").fill("2099-01-01");
    await expect(sheet.locator("article")).toHaveCount(0);
    await sheet.getByRole("button", { name: "All time", exact: true }).click();
    await expect(sheet.locator("article")).toHaveCount(count);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  }
});
