import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers";

test("mobile split, partial repayment, wallet and reports stay consistent", async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await waitForApp(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "People", exact: true }).click();
  await page.getByRole("button", { name: "Split a bill", exact: true }).click();
  let sheet = page.getByRole("dialog");
  await sheet.getByLabel(/Bill total/).fill("1000");
  await sheet.getByLabel("Note", { exact: true }).fill("Dinner with friends");
  await sheet.getByLabel("Payment method").selectOption("credit");
  await sheet.getByLabel("Card name").fill("HDFC");
  await sheet.getByRole("button", { name: "Save split" }).click();
  await expect(sheet).toBeHidden();
  const arbaz = page.locator("article").filter({ has: page.getByRole("heading", { name: "Arbaz", exact: true }) });
  await expect(arbaz).toContainText("₹200");
  await arbaz.getByRole("button", { name: "Record payment" }).click();
  sheet = page.getByRole("dialog");
  await sheet.getByLabel(/Amount/).fill("75");
  await sheet.getByRole("button", { name: "Record payment" }).click();
  await expect(sheet).toBeHidden();
  await expect(arbaz).toContainText("₹125");
  await expect(page.getByRole("button", { name: "Dismiss", exact: true })).toHaveCount(0, { timeout: 6000 });
  await page.screenshot({ path: "test-results/mobile-people.png", animations: "disabled" });
  await nav.getByRole("link", { name: "Wallet", exact: true }).click();
  await page.getByRole("button", { name: "Record bill payment" }).click();
  sheet = page.getByRole("dialog");
  await sheet.getByLabel(/Amount/).fill("400");
  await sheet.getByRole("button", { name: "Save payment" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator(".wallet-card")).toContainText("₹600");
  await nav.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page.locator(".metric-card").filter({ hasText: "My expense" })).toContainText("₹200");
  await expect(page.locator(".metric-card").filter({ hasText: "To receive" })).toContainText("₹725");
  await nav.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByRole("region", { name: "Monthly summary" })).toContainText("₹200");
  await page.screenshot({ path: "test-results/mobile-home.png", animations: "disabled" });
  await page.reload();
  await nav.getByRole("link", { name: "People", exact: true }).click();
  await expect(arbaz).toContainText("₹125");
  for (const width of [320, 390, 480]) {
    await page.setViewportSize({ width, height: 780 });
    for (const route of ["Home", "People", "Wallet", "Reports", "Settings"]) {
      await nav.getByRole("link", { name: route, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(nav).toBeInViewport();
    }
  }
  expect(errors).toEqual([]);
});
