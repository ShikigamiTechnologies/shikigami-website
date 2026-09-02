import { expect, test } from "@playwright/test";

const liveEnabled = process.env.SHIRABE_LIVE_E2E === "1";

test.describe("SHIRABE live production traversal", () => {
  test.skip(!liveEnabled, "Set SHIRABE_LIVE_E2E=1 for an explicitly approved synthetic production submission.");

  test("submits one synthetic Spanish diagnostic through the real Worker", async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

    await page.goto("https://shikigamitechnologies.com/shirabe?lang=es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await page.locator('[data-mode="guided"]').click();

    await page.locator('[name="name"]').fill("Operador Sintético Live");
    await page.locator('[name="company"]').fill("Shikigami Synthetic QA");
    await page.locator('[name="email"]').fill(`shirabe-live-${Date.now()}@example.invalid`);
    await page.locator('[name="role"]').fill("Evaluador sintético");
    await page.locator('[name="industry"]').fill("Prueba de software");
    await page.locator('[name="company_size"]').selectOption({ label: "1–9" });
    await page.locator("#next").click();

    await page.locator('[name="problem_category"]').selectOption("delays");
    await page.locator('[name="problem"]').fill("Las aprobaciones ficticias requieren reconstrucción manual repetida.");
    await page.locator('[name="last_example"]').fill("Un caso sintético esperó dos días sin contener información real.");
    await page.locator("#next").click();

    await page.locator('[name="trigger"]').fill("Solicitud sintética recibida");
    await page.locator('[name="participants"]').fill("Solicitante y revisor ficticios");
    await page.locator('[name="tools"]').fill("Correo y hoja sintéticos");
    await page.locator('[name="source_of_truth"]').fill("Registro de prueba versionado");
    await page.locator('[name="failure_point"]').fill("La entrega al revisor carece de dueño confirmado.");
    await page.locator('[name="frequency"]').selectOption("weekly");
    await page.locator('[name="monthly_volume"]').fill("12");
    await page.locator("#next").click();

    await page.locator('[name="consequence"]').fill("Demora informada sin pérdida financiera observada.");
    await page.locator('[name="loss_basis"]').selectOption("unknown");
    await page.locator('[name="integrity_concern"]').selectOption("none");
    await page.locator('[name="workforce_constraint"]').selectOption("adequate");
    await page.locator('[name="evidence_conflict"]').selectOption("yes");
    await page.locator('[name="disruption"]').selectOption("none");
    await page.locator('[name="evidence_available"]').fill("Conteos y fechas completamente sintéticos");
    await page.locator('[name="desired_outcome"]').fill("Determinar si conviene cambiar el proceso o no hacer nada.");
    await page.locator('[name="attempts"]').fill("Recordatorios manuales sintéticos");
    await page.locator('[name="constraints"]').fill("Sin conectores ni datos reales");
    await page.locator('[name="sensitivity"]').selectOption("none");
    await page.locator("#next").click();

    await page.locator('[name="consent"]').check();
    await page.waitForFunction(() => Date.now() - Number(document.querySelector('[name="started_at"]')?.value || 0) >= 4500);
    const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/shirabe-intake") && response.request().method() === "POST");
    await page.locator("#submit").click();
    const response = await responsePromise;
    const receipt = await response.json();
    expect(response.status(), JSON.stringify(receipt)).toBe(201);
    expect(receipt).toMatchObject({ ok: true, notification: "delivered" });
    expect(receipt.reference).toMatch(/^SHR-[A-F0-9]{16}$/);
    await expect(page.locator("#result-reference")).toHaveText(receipt.reference);
    expect(consoleErrors).toEqual([]);
    console.log(JSON.stringify({ reference: receipt.reference, completeness: receipt.completeness, notification: receipt.notification }));
  });
});
