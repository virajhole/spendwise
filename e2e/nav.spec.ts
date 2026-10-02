import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers";

test.describe("Navigation loop", () => {
  test("Home <-> Stats <-> Settings x20 with no errors and no runaway memory", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await waitForApp(page);

    const tabs = ["Stats", "Settings", "Home"] as const;
    await expect(page.getByRole("region", { name: /monthly summary/i })).toBeVisible();

    let before = 0;
    for (let i = 0; i < 20; i++) {
      for (const name of tabs) {
        await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click();
        await expect(page).toHaveURL(new RegExp(name === "Home" ? "/$" : `/${name.toLowerCase()}`));
        if (name === "Stats") await expect(page.getByText(/daily spending/i).first()).toBeVisible();
        if (name === "Settings") await expect(page.getByText(/appearance/i)).toBeVisible();
        if (name === "Home") await expect(page.getByRole("region", { name: /monthly summary/i })).toBeVisible();
      }
      if (i === 0) {
        before = await page.evaluate(() =>
          (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
        );
      }
    }

    const after = await page.evaluate(() =>
      (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
    );
    expect(errors).toEqual([]);
    if (before > 0 && after > 0) {
      // generous guard: repeated navigation must not grow the heap unboundedly
      expect(after - before).toBeLessThan(25_000_000);
    }
  });
});
