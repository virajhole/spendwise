import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers";

for (const system of ["dark", "light"] as const) {
  test(`theme switches in one tap from system ${system}; People has no month switcher`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: system });
    await waitForApp(page);
    await expect(page.getByRole("navigation", { name: "Month switcher" })).toBeVisible();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "People", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Month switcher" })).toHaveCount(0);
    const opposite = system === "dark" ? "light" : "dark";
    await page.getByRole("button", { name: `Switch to ${opposite} mode` }).click();
    await expect(page.locator("html")).toHaveClass(opposite === "dark" ? /dark/ : /^(?!.*\bdark\b).*$/);
    await page.reload();
    await expect(page.getByRole("button", { name: `Switch to ${system} mode` })).toBeVisible();
    await page.getByRole("button", { name: `Switch to ${system} mode` }).click();
    await expect(page.locator("html")).toHaveClass(system === "dark" ? /dark/ : /^(?!.*\bdark\b).*$/);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Wallet", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Month switcher" })).toBeVisible();
  });
}
