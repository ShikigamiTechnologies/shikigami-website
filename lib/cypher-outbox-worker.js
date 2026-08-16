const headers = (secret) => ({
  apikey: secret,
  authorization: `Bearer ${secret}`,
  "content-type": "application/json",
});

async function rpc(env, name, body) {
  const origin = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const secret = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!origin || !secret) throw new Error("outbox_worker_not_configured");
  const response = await fetch(`${origin}/rest/v1/rpc/${name}`, {
    method: "POST", headers: headers(secret), body: JSON.stringify(body),
    redirect: "manual", signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name}:${response.status}:${text.slice(0,300)}`);
  return text ? JSON.parse(text) : null;
}

async function execute(job, env) {
  if (job.topic === "extract") {
    if (env.CYPHER_STAGING_MODE !== "synthetic_only") throw new Error("live_ocr_not_authorized");
    return rpc(env, "cypher_run_extraction", {
      target_document: job.aggregate_id,
      extracted_fields: { processing_state: "synthetic_staging", source: "verified_private_upload" },
    });
  }
  throw new Error(`outbox_topic_not_implemented:${job.topic}`);
}

export async function drainCypherOutbox(env, batchSize = 5) {
  const jobs = await rpc(env, "cypher_claim_outbox", { batch_size: batchSize });
  const results = [];
  for (const job of jobs || []) {
    try {
      await execute(job, env);
      await rpc(env, "cypher_complete_outbox", { target_job: job.id });
      results.push({ id: job.id, topic: job.topic, status: "completed" });
    } catch (error) {
      const status = await rpc(env, "cypher_fail_outbox", { target_job: job.id, failure: String(error?.message || error), maximum_attempts: 3 });
      results.push({ id: job.id, topic: job.topic, status });
    }
  }
  return results;
}
