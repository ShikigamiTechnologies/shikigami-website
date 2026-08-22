import { describe, expect, it, vi } from "vitest";
import worker from "../worker.js";

function createEnv({ emailFailure } = {}) {
  const rows = new Map();
  const prepare = vi.fn((sql) => ({
    bind(...values) {
      return {
        async first() {
          if (!sql.startsWith("SELECT id,notified_at")) throw new Error(`Unexpected first(): ${sql}`);
          return [...rows.values()].find((row) => row.email.toLowerCase() === values[0]) || null;
        },
        async run() {
          if (sql.startsWith("INSERT INTO pilot_interest")) {
            const [id, created_at, organization, role, workflow, email] = values;
            rows.set(id, { id, created_at, organization, role, workflow, email, notified_at: null });
          } else if (sql.startsWith("UPDATE pilot_interest SET organization")) {
            const [organization, role, workflow, id] = values;
            Object.assign(rows.get(id), { organization, role, workflow, notification_error: null });
          } else if (sql.includes("notification_message_id")) {
            const [notification_message_id, notified_at, id] = values;
            Object.assign(rows.get(id), { notification_message_id, notified_at });
          } else if (sql.includes("notification_error=?")) {
            const [notification_error, id] = values;
            Object.assign(rows.get(id), { notification_error });
          } else {
            throw new Error(`Unexpected run(): ${sql}`);
          }
          return { success: true };
        },
      };
    },
  }));
  const send = emailFailure
    ? vi.fn().mockRejectedValue(new Error("provider unavailable"))
    : vi.fn().mockResolvedValue({ messageId: "message-test-1" });
  return { env: { LEADS: { prepare }, PILOT_EMAIL: { send } }, rows, send };
}

function request(body, options = {}) {
  return new Request("https://shikigamitechnologies.com/api/pilot-interest", {
    method: "POST",
    headers: { "content-type": "application/json", origin: options.origin || "https://shikigamitechnologies.com" },
    body: JSON.stringify({
      organization: "Example Public Works",
      role: "Operations director",
      workflow: "Review invoices and supporting records before controlled disposition.",
      email: "pilot@example.gov",
      started_at: Date.now() - 5_000,
      website: "",
      ...body,
    }),
  });
}

describe("pilot-interest intake", () => {
  it("stores a bounded lead and sends only to the configured Shikigami inbox", async () => {
    const { env, rows, send } = createEnv();
    const response = await worker.fetch(request(), env);
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(result.reference).toMatch(/[0-9a-f-]{36}/i);
    expect(rows.get(result.reference)).toMatchObject({ email: "pilot@example.gov", notified_at: expect.any(String) });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({
      to: "tengen@shikigamitechnologies.com",
      replyTo: "pilot@example.gov",
      subject: "Controlled pilot interest — Example Public Works",
    });
    expect(send.mock.calls[0][0].text).toContain("One workflow:");
  });

  it("retains the request and gives a direct-email fallback if notification fails", async () => {
    const { env, rows } = createEnv({ emailFailure: true });
    const response = await worker.fetch(request(), env);
    const result = await response.json();

    expect(response.status).toBe(503);
    expect(result.message).toContain("tengen@shikigamitechnologies.com");
    expect(rows.get(result.reference)).toMatchObject({ notification_error: expect.stringContaining("provider unavailable") });
  });

  it("rejects cross-origin and incomplete submissions before storage", async () => {
    const { env, rows, send } = createEnv();
    const crossOrigin = await worker.fetch(request({}, { origin: "https://example.com" }), env);
    const incomplete = await worker.fetch(request({ workflow: "short" }), env);

    expect(crossOrigin.status).toBe(403);
    expect(incomplete.status).toBe(400);
    expect(rows.size).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});
