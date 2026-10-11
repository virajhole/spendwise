import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers";
test("one net payment offsets the split and clears both directions", async ({ page }) => {
  await waitForApp(page);
  for (const text of ["mujhe Rini ko 1000 dene hain", "Rini take 200 dinner"]) {
    await page.getByLabel("Quick expense").fill(text);
    await page.getByRole("button", { name: "Send expense" }).click();
    await expect(page.getByLabel("Quick expense")).toHaveValue("");
  }
  await page.getByRole("navigation").getByRole("link", { name: "People", exact: true }).click();
  await page.getByRole("button", { name: "Open contact Rini" }).click();
  await page.getByRole("button", { name: "Pay ₹800", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Amount paid")).toHaveValue("800");
  await expect(dialog).toContainText("Automatic adjustment ₹200");
  await dialog.getByRole("button", { name: "Done · Record payment" }).click();
  await expect(dialog).toBeHidden();
  const contact = page.getByRole("region", { name: "Contact Rini", exact: true });
  await expect(contact).toContainText("To receive ₹0 · To pay ₹0");
  await expect(contact.getByRole("button", { name: /^Pay ₹/ })).toHaveCount(0);
  await contact.getByRole("button", { name: "Payments", exact: true }).click();
  await expect(contact.locator("article")).toHaveCount(1);
  await expect(contact.locator("article")).toContainText("₹800");
  await contact.getByRole("button", { name: "All activity" }).click();
  await expect(contact).toContainText("Adjusted receivable");
  await expect(contact).toContainText("Adjusted payable");
  await page.reload();
  await page.getByRole("button", { name: "Open contact Rini" }).click();
  await expect(contact).toContainText("To receive ₹0 · To pay ₹0");
});
