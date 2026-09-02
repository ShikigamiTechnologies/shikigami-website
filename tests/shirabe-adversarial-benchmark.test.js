import { describe, expect, it, vi } from "vitest";
import worker from "../worker.js";
import { assessShirabe, scoreDiagnosticCapability } from "../lib/shirabe-diagnostics.js";
import { shirabeScenarios } from "./fixtures/shirabe-adversarial-scenarios.js";

function environment() {
  const statements = [], state = { intake: null, routingTier: null, attempts: 0 };
  const prepare = vi.fn((sql) => ({ bind(...values) { return { sql, values,
    async first() {
      if (sql.startsWith("SELECT i.id,i.completeness")) return null;
      if (sql.startsWith("INSERT INTO shirabe_rate_limits")) return { request_count: 1 };
      if (sql.startsWith("SELECT i.id,i.created_at")) return { ...state.intake, routing_tier: state.routingTier, attempts: state.attempts };
      return null;
    },
    async all() { return { results: [] }; },
    async run() {
      statements.push({ sql, values });
      if (sql.startsWith("UPDATE shirabe_notification_outbox SET status='sending'")) { state.attempts += 1; return { success: true, meta: { changes: 1 } }; }
      return { success: true, meta: { changes: 1 } };
    },
  }; } }));
  const batch = vi.fn(async (items) => {
    statements.push(...items);
    const intake = items.find(({ sql }) => sql.startsWith("INSERT INTO shirabe_intakes"));
    if (intake) state.intake = { id: intake.values[0], created_at: intake.values[1], language: intake.values[3], mode: intake.values[4], name: intake.values[5], company: intake.values[6], email: intake.values[7], role: intake.values[8], completeness: intake.values[22], evidence_quality: intake.values[23], payload_json: intake.values[24], payload_hash: intake.values[25] };
    const routing = items.find(({ sql }) => sql.startsWith("INSERT INTO shirabe_routing_queue"));
    if (routing) state.routingTier = routing.values[3];
    return items.map(() => ({ success: true }));
  });
  return { env: { LEADS: { prepare, batch }, PILOT_EMAIL: { send: vi.fn().mockResolvedValue({ messageId: "synthetic-benchmark" }) }, LEAD_HASH_PEPPER: "synthetic-only" }, batch };
}

function normalized(payload) {
  return { ...payload, claimed_loss_minor: Math.round(payload.claimed_loss_amount * 100), category: payload.problem_category };
}

describe("SHIRABE bilingual adversarial benchmark", () => {
  it("contains five progressively complex scenarios per language and exact synthetic $10M terminal cases", () => {
    expect(shirabeScenarios).toHaveLength(10);
    expect(shirabeScenarios.filter(({ language }) => language === "en")).toHaveLength(5);
    expect(shirabeScenarios.filter(({ language }) => language === "es")).toHaveLength(5);
    for (const language of ["en", "es"]) expect(shirabeScenarios.filter((item) => item.language === language).map((item) => item.complexity)).toEqual([1, 2, 3, 4, 5]);
    expect(shirabeScenarios.filter(({ complexity }) => complexity === 5).every(({ payload }) => payload.claimed_loss_amount === 10_000_000)).toBe(true);
  });

  it.each(shirabeScenarios)("$id detects bounded signals without declaring guilt", ({ payload, expected }) => {
    const assessment = assessShirabe(normalized(payload));
    const codes = assessment.signals.map(({ code }) => code);
    expected.forEach((code) => expect(codes).toContain(code));
    expect(assessment.guardrail).toContain("does not establish fraud");
    expect(JSON.stringify(assessment)).not.toMatch(/fraud_detected|guilty|culpable/i);
    expect(scoreDiagnosticCapability(assessment).total).toBeGreaterThanOrEqual(95);
  });

  it.each(shirabeScenarios)("$id survives the real Worker intake contract", async ({ payload, complexity }) => {
    const { env, batch } = environment();
    const request = new Request("https://shikigamitechnologies.com/api/shirabe-intake", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://shikigamitechnologies.com" },
      body: JSON.stringify({ ...payload, started_at: Date.now() - 6000 }),
    });
    const response = await worker.fetch(request, env);
    const result = await response.json();
    expect(response.status, JSON.stringify(result)).toBe(201);
    expect(batch.mock.calls[0][0]).toHaveLength(4);
    if (complexity >= 3) expect(result.next_state).toBe("high_risk_governed_review");
  });

  it("rejects an asserted loss whose basis is unknown", async () => {
    const { env, batch } = environment();
    const request = new Request("https://shikigamitechnologies.com/api/shirabe-intake", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://shikigamitechnologies.com" },
      body: JSON.stringify({ ...shirabeScenarios[0].payload, claimed_loss_amount: 10_000_000, loss_basis: "unknown", started_at: Date.now() - 6000 }),
    });
    expect((await worker.fetch(request, env)).status).toBe(400);
    expect(batch).not.toHaveBeenCalled();
  });
});
