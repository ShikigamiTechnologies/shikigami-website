import { describe, expect, it, vi } from "vitest";
import worker, { runShirabeScheduledMaintenance } from "../worker.js";
import productionRaw from "../wrangler.jsonc?raw";
import stagingRaw from "../wrangler.staging.jsonc?raw";

function statement({ results = [], changes = 1 } = {}) {
  return {
    bind() { return this; },
    async run() { return { success: true, meta: { changes } }; },
    async all() { return { results }; },
    async first() { return null; },
  };
}

function environment(overrides = {}) {
  return {
    DEPLOYMENT_ENV: "production",
    SHIRABE_SCHEDULED_RECONCILIATION_ENABLED: "true",
    SHIRABE_RECONCILIATION_BATCH_LIMIT: "10",
    LEADS: { prepare: vi.fn(() => statement()), batch: vi.fn(async () => []) },
    PILOT_EMAIL: { send: vi.fn() },
    ...overrides,
  };
}

describe("SHIRABE scheduled reconciliation safety", () => {
  it("is disabled unless both production identity and the exact feature flag are present", async () => {
    expect(await runShirabeScheduledMaintenance(environment({ DEPLOYMENT_ENV: "staging" }))).toMatchObject({ status: "disabled", reason: "non_production_environment" });
    expect(await runShirabeScheduledMaintenance(environment({ SHIRABE_SCHEDULED_RECONCILIATION_ENABLED: "false" }))).toMatchObject({ status: "disabled", reason: "feature_flag_off" });
    expect(await runShirabeScheduledMaintenance(environment({ SHIRABE_SCHEDULED_RECONCILIATION_ENABLED: "TRUE" }))).toMatchObject({ status: "disabled", reason: "feature_flag_off" });
  });

  it("fails closed when an enabled production schedule lacks required bindings", async () => {
    await expect(runShirabeScheduledMaintenance(environment({ LEADS: undefined }))).rejects.toThrow("shirabe_scheduled_bindings_missing");
    await expect(runShirabeScheduledMaintenance(environment({ PILOT_EMAIL: undefined }))).rejects.toThrow("shirabe_scheduled_bindings_missing");
  });

  it("runs bounded reconciliation and retention with no due synthetic records", async () => {
    const env = environment({ SHIRABE_RECONCILIATION_BATCH_LIMIT: "999" });
    const result = await runShirabeScheduledMaintenance(env, new Date("2026-09-02T12:00:00.000Z"));
    expect(result).toEqual({ status: "completed", at: "2026-09-02T12:00:00.000Z", notification_count: 0, purged_count: 0 });
    expect(env.PILOT_EMAIL.send).not.toHaveBeenCalled();
  });

  it("registers scheduled work through waitUntil", async () => {
    const waitUntil = vi.fn();
    await worker.scheduled({}, environment({ SHIRABE_SCHEDULED_RECONCILIATION_ENABLED: "false" }), { waitUntil });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await expect(waitUntil.mock.calls[0][0]).resolves.toMatchObject({ status: "disabled" });
  });

  it("keeps admin routes fail-closed across missing, invalid, and staging authorization", async () => {
    const request = (authorization) => new Request("https://shikigamitechnologies.com/api/shirabe/admin/reconcile", { method: "POST", headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) }, body: "{}" });
    expect((await worker.fetch(request(), environment())).status).toBe(503);
    expect((await worker.fetch(request("Bearer wrong"), environment({ SHIRABE_ADMIN_TOKEN: "synthetic-correct-token" }))).status).toBe(401);
    expect((await worker.fetch(request("Bearer synthetic-correct-token"), environment({ DEPLOYMENT_ENV: "staging", SHIRABE_ADMIN_TOKEN: "synthetic-correct-token" }))).status).toBe(503);
    const get = new Request("https://shikigamitechnologies.com/api/shirabe/admin/reconcile", { method: "GET" });
    const getResponse = await worker.fetch(get, environment({ SHIRABE_ADMIN_TOKEN: "synthetic-correct-token" }));
    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get("allow")).toBe("POST");
  });

  it("keeps secrets out of tracked configuration and disables staging schedules", () => {
    expect(productionRaw).not.toMatch(/SHIRABE_ADMIN_TOKEN|LEAD_HASH_PEPPER|BEGIN (?:RSA |EC )?PRIVATE KEY/);
    expect(stagingRaw).not.toMatch(/SHIRABE_ADMIN_TOKEN|LEAD_HASH_PEPPER|BEGIN (?:RSA |EC )?PRIVATE KEY/);
    expect(productionRaw).toContain('"SHIRABE_SCHEDULED_RECONCILIATION_ENABLED": "false"');
    expect(stagingRaw).toContain('"crons": []');
  });
});
