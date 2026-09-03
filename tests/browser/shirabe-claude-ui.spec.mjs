import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  { path: "/services/shirabe/index.html", lang: "en", heading: /Understand the operation/i },
  { path: "/es/servicios/shirabe/index.html", lang: "es", heading: /Entienda la operación/i },
  { path: "/research/shirabe-process-diagnostic-comparison/index.html", lang: "en" },
  { path: "/es/investigacion/comparacion-diagnostico-procesos-shirabe/index.html", lang: "es" },
  { path: "/evidence/shirabe-synthetic-benchmark/index.html", lang: "en" },
  { path: "/es/evidencia/benchmark-sintetico-shirabe/index.html", lang: "es" },
];

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport });
    for (const target of pages) {
      test(`${target.path} is accessible and contained`, async ({ page }) => {
        await page.goto(target.path);
        await expect(page.locator("html")).toHaveAttribute("lang", target.lang);
        if (target.heading) await expect(page.getByRole("heading", { level: 1, name: target.heading })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      });
    }
  });
}

test("ten-step rail progresses and reduced motion remains readable", async ({ page }) => {
  await page.goto("/services/shirabe/index.html");
  await expect(page.locator(".process-step")).toHaveCount(10);
  await page.locator(".process-step").last().scrollIntoViewIfNeeded();
  await expect(page.locator("[data-method-current]")).toHaveText("10");
  await expect(page.locator('.process-step[aria-current="step"]')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".process-step").first()).toHaveCSS("opacity", "1");
});

test("five-state navigation and mobile menu expose the approved experience", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/services/shirabe/index.html");
  await expect(page.locator('[data-sh-anchor][aria-current="location"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Sections" }).click();
  await expect(page.locator("#sh-mobile-menu")).toBeVisible();
  await expect(page.locator("#sh-mobile-menu a")).toHaveCount(5);
  await page.locator('#sh-mobile-menu a[href="#offer"]').click();
  await expect(page.locator("#offer")).toBeInViewport();
});

test("service page preserves the exported Claude visual contract", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/services/shirabe/index.html");
  await expect(page.locator("body")).toHaveClass(/shirabe-service/);
  await expect(page.locator(".sh-graph")).toHaveCount(1);
  await expect(page.locator(".sh-hero")).toHaveCSS("min-height", "810px");
  await expect(page.locator("h1")).toHaveCSS("font-size", "80.64px");
  await expect(page.locator(".sh-hero .sh-cta")).toHaveCSS("border-radius", "999px");
  await expect(page.locator("#deliverables")).toBeHidden();
  const sectionOrder = await page.locator("main > [id]").evaluateAll((nodes) =>
    nodes.filter((node) => getComputedStyle(node).display !== "none").map((node) => node.id),
  );
  expect(sectionOrder).toEqual(["bridge", "method", "boundary", "offer", "evidence", "intake"]);
  const visualOrder = await page.locator("main > [id]").evaluateAll((nodes) =>
    nodes.filter((node) => getComputedStyle(node).display !== "none").sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((node) => node.id),
  );
  expect(visualOrder).toEqual(["bridge", "method", "boundary", "evidence", "offer", "intake"]);
});
