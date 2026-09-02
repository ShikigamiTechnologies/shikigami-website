import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyD1Migrations, env } from "cloudflare:test";
import worker, { purgeExpiredShirabeIntakes, reconcileShirabeNotifications, transitionShirabeRouting } from "../worker.js";

const basePayload = {
  schema: "shirabe-intake/v1", language: "en", mode: "guided", started_at: 1, website: "",
  name: "Synthetic Operator", company: "Fictional Regional Operator", email: "synthetic@example.test", role: "Operations director",
  industry: "Distribution", company_size: "50–199", problem_category: "delays",
  problem: "Synthetic approvals arrive through several channels and the complete queue cannot be reconstructed.",
  last_example: "A fictional item required three follow-ups before assignment.", trigger: "A fictional invoice arrives.",
  participants: "Receiving, operations, and finance.", tools: "Email and spreadsheets.", source_of_truth: "No single source.",
  failure_point: "Synthetic ownership is lost after the first handoff.", frequency: "daily", monthly_volume: 450,
  consequence: "The fictional team reports recurring delays without a verified total cost.", claimed_loss_amount: 0,
  loss_currency: "USD", loss_basis: "unknown", integrity_concern: "none", workforce_constraint: "adequate",
  evidence_conflict: "no", disruption: "none", evidence_available: "Synthetic counts and timestamps.",
  desired_outcome: "Measure assignment time and reduce unresolved fictional work.", attempts: "Shared tracker.",
  constraints: "Bilingual operators and limited IT support.", sensitivity: "financial", consent: true,
};

function intakeRequest(overrides = {}) {
  return new Request("https://shikigamitechnologies.com/api/shirabe-intake", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://shikigamitechnologies.com", "cf-connecting-ip": "192.0.2.80" },
    body: JSON.stringify({ ...basePayload, started_at: Date.now() - 6000, ...overrides }),
  });
}

function runtime(send = vi.fn().mockResolvedValue({ messageId: "synthetic-message-1" })) {
  return { LEADS: env.LEADS, PILOT_EMAIL: { send }, LEAD_HASH_PEPPER: "synthetic-only-pepper", SHIRABE_RETENTION_DAYS: "180", SHIRABE_RATE_LIMIT_PER_HOUR: "5" };
}

beforeAll(async () => { await applyD1Migrations(env.LEADS, env.TEST_SHIRABE_MIGRATIONS); });
beforeEach(async () => {
  await env.LEADS.batch([
    env.LEADS.prepare("DELETE FROM shirabe_lifecycle_events"),
    env.LEADS.prepare("DELETE FROM shirabe_intakes"),
    env.LEADS.prepare("DELETE FROM shirabe_rate_limits"),
  ]);
});

describe("SHIRABE D1 reliability", () => {
  it("persists one intake/outbox and deterministically replays an identical submission", async () => {
    const send = vi.fn().mockResolvedValue({ messageId: "synthetic-message-1" }), body = { started_at: Date.now() - 6000 };
    const first = await worker.fetch(intakeRequest(body), runtime(send));
    const firstBody = await first.json();
    const second = await worker.fetch(intakeRequest(body), runtime(send));
    expect(first.status).toBe(201); expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ replayed: true, reference: firstBody.reference });
    expect(send).toHaveBeenCalledTimes(1);
    expect((await env.LEADS.prepare("SELECT count(*) AS value FROM shirabe_intakes").first()).value).toBe(1);
    expect((await env.LEADS.prepare("SELECT count(*) AS value FROM shirabe_notification_outbox").first()).value).toBe(1);
    expect((await env.LEADS.prepare("SELECT count(*) AS value FROM shirabe_lifecycle_events WHERE event_type='duplicate_replayed'").first()).value).toBe(1);
  });

  it("retains a failed notification and reconciles it exactly once", async () => {
    const failed = vi.fn().mockRejectedValue(new Error("synthetic provider outage"));
    const created = await worker.fetch(intakeRequest(), runtime(failed));
    const { reference } = await created.json();
    expect((await env.LEADS.prepare("SELECT status,attempts FROM shirabe_notification_outbox WHERE intake_id=?").bind(reference).first())).toMatchObject({ status: "retry", attempts: 1 });
    await env.LEADS.prepare("UPDATE shirabe_notification_outbox SET next_attempt_at='2000-01-01T00:00:00.000Z' WHERE intake_id=?").bind(reference).run();
    const send = vi.fn().mockResolvedValue({ messageId: "synthetic-recovered" });
    const one = await reconcileShirabeNotifications(runtime(send), 10, new Date());
    const two = await reconcileShirabeNotifications(runtime(send), 10, new Date());
    expect(one).toHaveLength(1); expect(two).toHaveLength(0); expect(send).toHaveBeenCalledTimes(1);
    expect((await env.LEADS.prepare("SELECT status,attempts,message_id FROM shirabe_notification_outbox WHERE intake_id=?").bind(reference).first())).toMatchObject({ status: "delivered", attempts: 2, message_id: "synthetic-recovered" });
  });

  it("recovers a stale sending claim after an interrupted worker", async () => {
    const { reference } = await (await worker.fetch(intakeRequest(), runtime())).json();
    await env.LEADS.prepare("UPDATE shirabe_notification_outbox SET status='sending',message_id=NULL,delivered_at=NULL,locked_at='2000-01-01T00:00:00.000Z' WHERE intake_id=?").bind(reference).run();
    const send = vi.fn().mockResolvedValue({ messageId: "synthetic-stale-recovery" });
    const result = await reconcileShirabeNotifications(runtime(send), 10, new Date());
    expect(result).toHaveLength(1); expect(send).toHaveBeenCalledTimes(1);
    expect((await env.LEADS.prepare("SELECT status,message_id FROM shirabe_notification_outbox WHERE intake_id=?").bind(reference).first())).toMatchObject({ status: "delivered", message_id: "synthetic-stale-recovery" });
  });

  it("enforces routing transitions and rejects skips", async () => {
    const { reference } = await (await worker.fetch(intakeRequest(), runtime())).json();
    await expect(transitionShirabeRouting(runtime(), reference, "completed")).rejects.toThrow("shirabe_invalid_routing_transition");
    expect(await transitionShirabeRouting(runtime(), reference, "claimed")).toMatchObject({ routing_state: "claimed" });
    expect(await transitionShirabeRouting(runtime(), reference, "completed")).toMatchObject({ routing_state: "completed", intake_state: "closed" });
    expect((await env.LEADS.prepare("SELECT status FROM shirabe_intakes WHERE id=?").bind(reference).first()).status).toBe("closed");
  });

  it("expires the complete intake and keeps only a hash tombstone", async () => {
    const { reference } = await (await worker.fetch(intakeRequest(), runtime())).json();
    await transitionShirabeRouting(runtime(), reference, "claimed"); await transitionShirabeRouting(runtime(), reference, "completed");
    await env.LEADS.prepare("UPDATE shirabe_intakes SET retention_expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").bind(reference).run();
    expect(await purgeExpiredShirabeIntakes(runtime(), new Date())).toEqual({ purged: 1 });
    expect(await env.LEADS.prepare("SELECT id FROM shirabe_intakes WHERE id=?").bind(reference).first()).toBeNull();
    const tombstone = await env.LEADS.prepare("SELECT intake_id,event_type,payload_hash FROM shirabe_lifecycle_events WHERE event_type='retention_expired'").first();
    expect(tombstone.intake_id).toBeNull(); expect(tombstone.payload_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rate limits unique submissions without creating a sixth intake", async () => {
    for (let index = 0; index < 5; index++) expect((await worker.fetch(intakeRequest({ email: `synthetic-${index}@example.test`, problem: `${basePayload.problem} Case ${index}.` }), runtime())).status).toBe(201);
    const denied = await worker.fetch(intakeRequest({ email: "synthetic-denied@example.test", problem: `${basePayload.problem} Denied case.` }), runtime());
    expect(denied.status).toBe(429); expect(denied.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await env.LEADS.prepare("SELECT count(*) AS value FROM shirabe_intakes").first()).value).toBe(5);
  });

  it("keeps administration fail-closed when its secret is absent", async () => {
    const response = await worker.fetch(new Request("https://shikigamitechnologies.com/api/shirabe/admin/reconcile", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), runtime());
    expect(response.status).toBe(503);
  });
});
