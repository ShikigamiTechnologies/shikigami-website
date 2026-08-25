import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 768, height: 1024 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${viewport.name} exposes the bounded bilingual diagnostic without overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/shirabe.html");
    await page.getByRole("button", { name: /Guided diagnostic/i }).click();
    await expect(page.locator('input[name="claimed_loss_amount"]')).toHaveCount(1);
    await expect(page.locator('select[name="integrity_concern"]')).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.getByRole("button", { name: "ES" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });
}
