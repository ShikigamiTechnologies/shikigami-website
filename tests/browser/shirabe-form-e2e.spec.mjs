import { expect, test } from "@playwright/test";

test("synthetic bilingual prospect completes the full browser workflow", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.route("**/api/shirabe-intake", async (route) => {
    const payload = route.request().postDataJSON();
    expect(payload).toMatchObject({ schema: "shirabe-intake/v1", language: "es", consent: true });
    expect(payload.problem).toContain("ficticias");
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, reference: "SHR-0123456789abcdef", completeness: 100, evidence_quality: "substantial_self_report", next_state: "qualified_review", notification: "delivered" }) });
  });
  await page.goto("/shirabe.html?lang=es");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByText("No incluya material sensible en este formulario.")).toBeVisible();
  await page.locator('[data-mode="guided"]').click();

  await page.locator('[name="name"]').fill("Operador Sintético");
  await page.locator('[name="company"]').fill("Organización Ficticia Uno");
  await page.locator('[name="email"]').fill("synthetic-shirabe@example.invalid");
  await page.locator('[name="role"]').fill("Dueño del flujo");
  await page.locator('[name="industry"]').fill("Prueba sintética");
  await page.locator('[name="company_size"]').selectOption({ label: "10–49" });
  await page.locator("#next").click();

  await page.locator('[name="problem_category"]').selectOption("delays");
  await page.locator('[name="problem"]').fill("Las aprobaciones ficticias llegan tarde y requieren reconstrucción manual repetida.");
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

  await expect(page.locator("#review-summary")).toContainText("Organización Ficticia Uno");
  await page.locator('[name="consent"]').check();
  await page.locator("#submit").click();
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#result-reference")).toHaveText("SHR-0123456789abcdef");
  await expect(page.locator("#result-completeness")).toHaveText("100%");
  expect(consoleErrors).toEqual([]);
});
