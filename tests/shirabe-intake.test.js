import { describe, expect, it, vi } from "vitest";
import worker from "../worker.js";
import html from "../shirabe.html?raw";
import script from "../assets/js/shirabe.js?raw";

function createEnv({ emailFailure = false, batchFailure = false } = {}) {
  const statements = [];
  const prepare = vi.fn((sql) => ({
    bind(...values) {
      const statement = { sql, values, async run() { statements.push(statement); return { success: true }; } };
      return statement;
    },
  }));
  const batch = vi.fn(async (items) => {
    if (batchFailure) throw new Error("database unavailable");
    statements.push(...items);
    return items.map(() => ({ success: true }));
  });
  const send = emailFailure ? vi.fn().mockRejectedValue(new Error("provider unavailable")) : vi.fn().mockResolvedValue({ messageId: "shirabe-message-1" });
  return { env: { LEADS: { prepare, batch }, PILOT_EMAIL: { send }, LEAD_HASH_PEPPER: "test-only-pepper" }, statements, batch, send };
}

function payload(overrides = {}) {
  return {
    schema: "shirabe-intake/v1", language: "en", mode: "guided", started_at: Date.now() - 6000, website: "",
    name: "Alex Rivera", company: "Example Regional Operator", email: "alex@example.com", role: "Operations director",
    industry: "Distribution", company_size: "50–199", problem_category: "delays",
    problem: "Approvals arrive through several channels and no one can see the complete queue.",
    last_example: "A safe synthetic example required three follow-ups before assignment.", trigger: "An invoice arrives.",
    participants: "Receiving, operations, and finance.", tools: "Email and spreadsheets.", source_of_truth: "No single source.",
    failure_point: "Ownership is lost after the first email handoff.", frequency: "daily", monthly_volume: 450,
    consequence: "The team estimates recurring delays and rework, but has not measured the total cost.",
    claimed_loss_amount: 0, loss_currency: "USD", loss_basis: "unknown", integrity_concern: "none",
    workforce_constraint: "adequate", evidence_conflict: "no", disruption: "none",
    evidence_available: "Anonymized counts and timestamps could be approved later.",
    desired_outcome: "Measure assignment time and reduce unresolved work by at least twenty percent.",
    attempts: "Shared tracker and inbox rules.", constraints: "Bilingual operators and limited IT support.", sensitivity: "financial", consent: true,
    ...overrides,
  };
}

function request(body = payload(), options = {}) {
  return new Request("https://shikigamitechnologies.com/api/shirabe-intake", {
    method: options.method || "POST",
    headers: { "content-type": options.contentType || "application/json", origin: options.origin || "https://shikigamitechnologies.com", "cf-connecting-ip": "192.0.2.4" },
    body: options.method === "GET" ? undefined : JSON.stringify(body),
  });
}

describe("SHIRABE intake", () => {
  it("atomically stores a hash-bound intake and routing task, then notifies the owner", async () => {
    const { env, batch, send, statements } = createEnv();
    const response = await worker.fetch(request(), env);
    const result = await response.json();
    expect(response.status).toBe(201);
    expect(result).toMatchObject({ ok: true, evidence_quality: "substantial_self_report", next_state: "qualified_review" });
    expect(result.reference).toMatch(/^SHR-[A-F0-9]{16}$/);
    expect(result.completeness).toBeGreaterThanOrEqual(85);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(2);
    expect(batch.mock.calls[0][0][0].sql).toContain("INSERT INTO shirabe_intakes");
    expect(batch.mock.calls[0][0][1].sql).toContain("INSERT INTO shirabe_routing_queue");
    expect(batch.mock.calls[0][0][0].values.at(-2)).toMatch(/^[a-f0-9]{64}$/);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].text).toContain("not an independently verified diagnosis");
    expect(statements.some((entry) => entry.sql.startsWith("UPDATE shirabe_intakes SET notification_message_id"))).toBe(true);
  });

  it("accepts the diagnostic even when owner notification fails and records the failure", async () => {
    const { env, statements } = createEnv({ emailFailure: true });
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(201);
    expect(statements.some((entry) => entry.sql.startsWith("UPDATE shirabe_intakes SET notification_error"))).toBe(true);
  });

  it("produces a stable evidence hash across identical replays while keeping unique references", async () => {
    const first = createEnv(), second = createEnv();
    const one = await (await worker.fetch(request(), first.env)).json();
    const two = await (await worker.fetch(request(), second.env)).json();
    const firstHash = first.batch.mock.calls[0][0][0].values.at(-3);
    const secondHash = second.batch.mock.calls[0][0][0].values.at(-3);
    expect(one.reference).not.toBe(two.reference);
    expect(firstHash).toBe(secondHash);
  });

  it("scores Quick Signal against its bounded field set and keeps it on clarification routing", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(request(payload({ mode: "signal", last_example: "", trigger: "", participants: "", tools: "", source_of_truth: "", evidence_available: "", attempts: "", constraints: "" })), env);
    expect(await response.json()).toMatchObject({ completeness: 100, evidence_quality: "substantial_self_report", next_state: "clarification_required" });
  });

  it("fails safely when the atomic database write fails", async () => {
    const { env, send } = createEnv({ batchFailure: true });
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["cross-origin request", payload(), { origin: "https://attacker.example" }, 403],
    ["too-fast request", payload({ started_at: Date.now() - 100 }), {}, 400],
    ["missing consent", payload({ consent: false }), {}, 400],
    ["underspecified problem", payload({ problem: "Too slow" }), {}, 400],
    ["unknown schema", payload({ schema: "shirabe-intake/v2" }), {}, 400],
  ])("rejects %s", async (_name, body, options, status) => {
    const { env } = createEnv();
    expect((await worker.fetch(request(body, options), env)).status).toBe(status);
  });

  it("silently absorbs honeypot submissions without persistence", async () => {
    const { env, batch, send } = createEnv();
    const response = await worker.fetch(request(payload({ website: "spam.example" })), env);
    expect(response.status).toBe(201);
    expect(batch).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });

  it("exposes a bounded bilingual, upload-free guided interface", () => {
    expect(html).toContain('data-language="es"');
    expect(html).toContain('value="shirabe-intake/v1"');
    expect(html).not.toMatch(/type=["']file["']/i);
    expect(html).toContain("Here is what we heard");
    expect(script).toContain("sessionStorage");
    expect(script).toContain("/api/shirabe-intake");
  });
});
