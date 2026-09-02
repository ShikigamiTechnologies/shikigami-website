import { handleCypherSupabaseRoute } from "./lib/cypher-supabase-adapter.js";
import { assessShirabe } from "./lib/shirabe-diagnostics.js";
// Batch C's sandbox runner imports this named export. It deliberately is not a
// public HTTP or queue handler, so no connector credentials can cross the edge.
export { dispatchDelivery as dispatchCypherDelivery } from "./lib/cypher-batch-c.js";

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json;charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra },
});
const clean = (value, length) => String(value || "").trim().slice(0, length);
const editions = new Set(["core", "operations", "enterprise", "government", "federal"]);
const sizes = new Set(["1–19", "20–49", "50–199", "200–500", "501+"]);
const contracts = new Set(["None yet", "1–3", "4–10", "11–25", "26+"]);
const encoder = new TextEncoder();
const publicPaths = [
  "/",
  "/services/shirabe/",
  "/es/servicios/shirabe/",
  "/research/shirabe-process-diagnostic-comparison/",
  "/es/investigacion/comparacion-diagnostico-procesos-shirabe/",
  "/evidence/shirabe-synthetic-benchmark/",
  "/es/evidencia/benchmark-sintetico-shirabe/",
  "/shirabe",
  "/cypher",
  "/anor",
  "/ironcrew",
  "/kizuna",
  "/pricing-themis",
  "/privacy",
  "/security",
  "/terms",
  "/acceptable-use"
];
const securityHeaders = {
  "content-security-policy": "default-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
  "referrer-policy": "strict-origin-when-cross-origin", "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "x-content-type-options": "nosniff", "x-frame-options": "DENY", "cross-origin-opener-policy": "same-origin",
};
const publicOriginHosts = new Set(["shikigamitechnologies.com", "www.shikigamitechnologies.com"]);

function validRequestOrigin(origin, requestUrl) {
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    return originUrl.protocol === "https:" && (originUrl.host === requestUrl.host || publicOriginHosts.has(originUrl.hostname));
  } catch {
    return false;
  }
}

function bytesToHex(bytes) { return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function bytesToBase64(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
async function sha256(value) { return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))); }
function randomHex(bytes = 8) { const value = new Uint8Array(bytes); crypto.getRandomValues(value); return bytesToHex(value).toUpperCase(); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function pemToDer(pem) { const value = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ""); return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
async function signLicense(payload, privateKeyPem) {
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(privateKeyPem), { name: "RSA-PSS", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64(new Uint8Array(await crypto.subtle.sign({ name: "RSA-PSS", saltLength: 32 }, key, encoder.encode(canonical(payload)))));
}
async function secretMatches(provided, expected) {
  if (!provided || !expected) return false;
  const [left, right] = await Promise.all([sha256(provided), sha256(expected)]); let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
function isoDateAfter(days) { const value = new Date(); value.setUTCDate(value.getUTCDate() + Number(days)); return value.toISOString().slice(0, 10); }

async function submitAnor(request, env) {
  const origin = request.headers.get("origin"), url = new URL(request.url);
  if (origin && new URL(origin).host !== url.host) return json({ message: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ message: "Expected JSON." }, 415);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid request." }, 400); }
  if (clean(body.website, 100)) return json({ ok: true });
  const started = Number(body.started_at || 0);
  if (!started || Date.now() - started < 2500 || Date.now() - started > 86400000) return json({ message: "Please reload and try again." }, 400);
  const entry = { id: crypto.randomUUID(), at: new Date().toISOString(), name: clean(body.name, 120), email: clean(body.email, 254).toLowerCase(), company: clean(body.company, 160), role: clean(body.role, 120), size: clean(body.company_size, 40), contracts: clean(body.active_contracts, 40), tools: clean(body.current_tools, 500), pain: clean(body.pain_point, 2000), consent: body.consent === true ? 1 : 0 };
  if (entry.name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email) || entry.company.length < 2 || entry.role.length < 2 || !sizes.has(entry.size) || !contracts.has(entry.contracts) || entry.tools.length < 2 || entry.pain.length < 20 || !entry.consent) return json({ message: "Please complete every required field." }, 400);
  try {
    await env.LEADS.prepare("INSERT INTO anor_beta_applications (id,created_at,name,email,company,role,company_size,active_contracts,current_tools,pain_point,consent) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(entry.id, entry.at, entry.name, entry.email, entry.company, entry.role, entry.size, entry.contracts, entry.tools, entry.pain, entry.consent).run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) return json({ message: "This email already has a request on file." }, 409);
    console.error(JSON.stringify({ event: "anor_insert_failed", message: error?.message })); return json({ message: "The request could not be saved right now." }, 503);
  }
  return json({ ok: true }, 201);
}

async function submitPilotInterest(request, env) {
  const origin = request.headers.get("origin"), url = new URL(request.url);
  if (!validRequestOrigin(origin, url)) return json({ message: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ message: "Expected JSON." }, 415);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid request." }, 400); }
  if (clean(body.website, 100)) return json({ ok: true }, 201);
  const started = Number(body.started_at || 0), elapsed = Date.now() - started;
  if (!started || elapsed < 2500 || elapsed > 86400000) return json({ message: "Please reload and try again." }, 400);
  const entry = {
    id: crypto.randomUUID(), at: new Date().toISOString(),
    organization: clean(body.organization, 160), role: clean(body.role, 120),
    workflow: clean(body.workflow, 2000), email: clean(body.email, 254).toLowerCase(),
  };
  if (entry.organization.length < 2 || entry.role.length < 2 || entry.workflow.length < 10 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)) {
    return json({ message: "Please complete every required field." }, 400);
  }
  const existing = await env.LEADS.prepare("SELECT id,notified_at FROM pilot_interest WHERE lower(email)=?").bind(entry.email).first();
  if (existing?.notified_at) return json({ message: "This email already has a pilot request on file." }, 409);
  try {
    if (existing) {
      entry.id = existing.id;
      await env.LEADS.prepare("UPDATE pilot_interest SET organization=?,role=?,workflow=?,notification_error=NULL WHERE id=?")
        .bind(entry.organization, entry.role, entry.workflow, entry.id).run();
    } else {
      await env.LEADS.prepare("INSERT INTO pilot_interest(id,created_at,organization,role,workflow,email) VALUES(?,?,?,?,?,?)")
        .bind(entry.id, entry.at, entry.organization, entry.role, entry.workflow, entry.email).run();
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "pilot_interest_insert_failed", message: error?.message }));
    return json({ message: "Your request could not be saved right now." }, 503);
  }
  try {
    const result = await env.PILOT_EMAIL.send({
      to: "tengen@shikigamitechnologies.com",
      from: { email: "website@shikigamitechnologies.com", name: "Shikigami Website" },
      replyTo: entry.email,
      subject: `Controlled pilot interest — ${entry.organization}`,
      text: [
        "New controlled-pilot interest received.", "",
        `Reference: ${entry.id}`, `Received: ${entry.at}`,
        `Organization: ${entry.organization}`, `Role: ${entry.role}`,
        `Work email: ${entry.email}`, "", "One workflow:", entry.workflow, "",
        "This message originated from the bounded public scoping form. No files or credentials were accepted.",
      ].join("\n"),
    });
    await env.LEADS.prepare("UPDATE pilot_interest SET notification_attempts=notification_attempts+1,notification_message_id=?,notification_error=NULL,notified_at=? WHERE id=?")
      .bind(result.messageId, new Date().toISOString(), entry.id).run();
    return json({ ok: true, reference: entry.id }, 201);
  } catch (error) {
    const code = clean(error?.code || "EMAIL_SEND_FAILED", 80), message = clean(error?.message || "Email notification failed.", 300);
    await env.LEADS.prepare("UPDATE pilot_interest SET notification_attempts=notification_attempts+1,notification_error=? WHERE id=?")
      .bind(`${code}: ${message}`, entry.id).run();
    console.error(JSON.stringify({ event: "pilot_interest_email_failed", code, message, reference: entry.id }));
    return json({ message: "Your request was saved, but the notification could not be sent. Please email tengen@shikigamitechnologies.com directly.", reference: entry.id }, 503);
  }
}

const shirabeLanguages = new Set(["en", "es"]);
const shirabeModes = new Set(["signal", "guided"]);
const shirabeCategories = new Set(["documents", "delays", "systems", "approvals", "compliance", "intake", "visibility", "reporting", "mixed", "unknown"]);
const shirabeFrequencies = new Set(["daily", "weekly", "monthly", "quarterly", "irregular", "unknown"]);
const shirabeSensitivity = new Set(["none", "personal", "financial", "health", "government", "regulated", "unknown"]);
const shirabeLossBasis = new Set(["measured", "estimated", "reported", "unknown"]);
const shirabeIntegrity = new Set(["none", "unexplained_discrepancy", "allegation", "internal_investigation", "external_investigation", "unknown"]);
const shirabeWorkforce = new Set(["adequate", "understaffed", "contractor_dependency", "unknown"]);
const shirabeEvidenceConflict = new Set(["yes", "no", "unknown"]);
const shirabeDisruptions = new Set(["none", "vendor_outage", "cyber_outage", "natural_disaster", "labor_disruption", "other", "unknown"]);
const shirabeIntakeStates = new Set(["received", "clarification_required", "qualified_review", "closed"]);
const shirabeRoutingTransitions = {
  pending: new Set(["claimed", "failed"]),
  claimed: new Set(["completed", "failed"]),
  failed: new Set(["pending"]),
  completed: new Set(),
};
const SHIRABE_RATE_WINDOW_MS = 60 * 60 * 1000;
const SHIRABE_RATE_LIMIT_DEFAULT = 5;
const SHIRABE_RETENTION_DAYS_DEFAULT = 180;
const SHIRABE_NOTIFICATION_MAX_ATTEMPTS = 5;

async function recordShirabeEvent(env, intakeId, payloadHash, eventType, fromState = null, toState = null, details = {}) {
  await env.LEADS.prepare("INSERT INTO shirabe_lifecycle_events(id,intake_id,payload_hash,event_type,from_state,to_state,details_json,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), intakeId, payloadHash, eventType, fromState, toState, canonical(details), new Date().toISOString()).run();
}

async function enforceShirabeRateLimit(env, subjectHash, now = Date.now()) {
  if (!subjectHash) return { allowed: true, remaining: null };
  const configured = Number(env.SHIRABE_RATE_LIMIT_PER_HOUR || SHIRABE_RATE_LIMIT_DEFAULT);
  const limit = Number.isSafeInteger(configured) && configured > 0 ? Math.min(configured, 100) : SHIRABE_RATE_LIMIT_DEFAULT;
  const bucket = Math.floor(now / SHIRABE_RATE_WINDOW_MS) * SHIRABE_RATE_WINDOW_MS;
  const result = await env.LEADS.prepare("INSERT INTO shirabe_rate_limits(subject_hash,bucket_start,request_count,updated_at) VALUES(?,?,1,?) ON CONFLICT(subject_hash,bucket_start) DO UPDATE SET request_count=request_count+1,updated_at=excluded.updated_at RETURNING request_count")
    .bind(subjectHash, bucket, new Date(now).toISOString()).first();
  const count = Number(result?.request_count || 1);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfter: Math.ceil((bucket + SHIRABE_RATE_WINDOW_MS - now) / 1000) };
}

function shirabeNotificationMessage(row) {
  const payload = JSON.parse(row.payload_json);
  return {
    to: "tengen@shikigamitechnologies.com",
    from: { email: "website@shikigamitechnologies.com", name: "SHIRABE by Shikigami" },
    replyTo: row.email,
    subject: `SHIRABE diagnostic — ${row.company}`,
    text: [
      "New SHIRABE diagnostic received.", "", `Reference: ${row.id}`, `Payload SHA-256: ${row.payload_hash}`,
      `Received: ${row.created_at}`, `Company: ${row.company}`, `Contact: ${row.name} (${row.role})`,
      `Work email: ${row.email}`, `Language: ${row.language}`, `Mode: ${row.mode}`,
      `Completeness: ${row.completeness}%`, `Evidence quality: ${row.evidence_quality}`, `Routing: ${row.routing_tier}`,
      `Deterministic signals: ${payload.assessment?.signals?.map(({ code }) => code).join(", ") || "none"}`,
      payload.assessment?.guardrail || "Human review remains authoritative.", "", "Reported problem:", payload.problem, "",
      "Reported failure point:", payload.failure_point, "", "Desired outcome:", payload.desired_outcome, "",
      "This is a prospect self-report, not an independently verified diagnosis. No files or credentials were accepted.",
    ].join("\n"),
  };
}

async function deliverShirabeNotification(env, intakeId, now = new Date()) {
  const timestamp = now.toISOString();
  const claim = await env.LEADS.prepare("UPDATE shirabe_notification_outbox SET status='sending',attempts=attempts+1,locked_at=?,updated_at=? WHERE intake_id=? AND status IN ('pending','retry') AND next_attempt_at<=? AND attempts<?")
    .bind(timestamp, timestamp, intakeId, timestamp, SHIRABE_NOTIFICATION_MAX_ATTEMPTS).run();
  if (Number(claim?.meta?.changes || 0) !== 1) return { status: "not_due" };
  const row = await env.LEADS.prepare("SELECT i.id,i.created_at,i.name,i.company,i.email,i.role,i.language,i.mode,i.completeness,i.evidence_quality,i.payload_json,i.payload_hash,q.routing_tier,o.attempts FROM shirabe_intakes i JOIN shirabe_routing_queue q ON q.intake_id=i.id JOIN shirabe_notification_outbox o ON o.intake_id=i.id WHERE i.id=?").bind(intakeId).first();
  if (!row) return { status: "missing" };
  await recordShirabeEvent(env, row.id, row.payload_hash, "notification_claimed", null, "sending", { attempt: row.attempts });
  try {
    const result = await env.PILOT_EMAIL.send(shirabeNotificationMessage(row));
    const deliveredAt = new Date().toISOString();
    await env.LEADS["batch"]([
      env.LEADS.prepare("UPDATE shirabe_notification_outbox SET status='delivered',message_id=?,delivered_at=?,last_error=NULL,locked_at=NULL,updated_at=? WHERE intake_id=? AND status='sending'").bind(result.messageId, deliveredAt, deliveredAt, row.id),
      env.LEADS.prepare("UPDATE shirabe_intakes SET notification_message_id=?,notification_error=NULL,notified_at=?,updated_at=? WHERE id=?").bind(result.messageId, deliveredAt, deliveredAt, row.id),
    ]);
    await recordShirabeEvent(env, row.id, row.payload_hash, "notification_delivered", "sending", "delivered", { attempt: row.attempts });
    return { status: "delivered", messageId: result.messageId };
  } catch (error) {
    const message = clean(error?.message || "Email notification failed.", 300);
    const dead = Number(row.attempts) >= SHIRABE_NOTIFICATION_MAX_ATTEMPTS;
    const retryAt = new Date(now.getTime() + Math.min(60, 2 ** Number(row.attempts)) * 60_000).toISOString();
    await env.LEADS["batch"]([
      env.LEADS.prepare("UPDATE shirabe_notification_outbox SET status=?,next_attempt_at=?,last_error=?,locked_at=NULL,updated_at=? WHERE intake_id=? AND status='sending'").bind(dead ? "dead" : "retry", retryAt, message, timestamp, row.id),
      env.LEADS.prepare("UPDATE shirabe_intakes SET notification_error=?,updated_at=? WHERE id=?").bind(message, timestamp, row.id),
    ]);
    await recordShirabeEvent(env, row.id, row.payload_hash, dead ? "notification_dead" : "notification_retry", "sending", dead ? "dead" : "retry", { attempt: row.attempts, retry_at: dead ? null : retryAt });
    console.error(JSON.stringify({ event: "shirabe_email_failed", message, reference: row.id, attempt: row.attempts }));
    return { status: dead ? "dead" : "retry", retryAt: dead ? null : retryAt };
  }
}

export async function reconcileShirabeNotifications(env, limit = 10, now = new Date()) {
  const bounded = Math.max(1, Math.min(25, Number(limit) || 10));
  const staleBefore = new Date(now.getTime() - 5 * 60_000).toISOString();
  await env.LEADS.prepare("UPDATE shirabe_notification_outbox SET status='retry',locked_at=NULL,next_attempt_at=?,last_error='stale_claim_recovered',updated_at=? WHERE status='sending' AND locked_at<=?")
    .bind(now.toISOString(), now.toISOString(), staleBefore).run();
  const due = await env.LEADS.prepare("SELECT intake_id FROM shirabe_notification_outbox WHERE status IN ('pending','retry') AND next_attempt_at<=? ORDER BY next_attempt_at,id LIMIT ?")
    .bind(now.toISOString(), bounded).all();
  const results = [];
  for (const row of due.results || []) results.push({ intake_id: row.intake_id, ...(await deliverShirabeNotification(env, row.intake_id, now)) });
  return results;
}

export async function transitionShirabeRouting(env, intakeId, nextState) {
  const row = await env.LEADS.prepare("SELECT i.status AS intake_status,i.payload_hash,q.status AS routing_status FROM shirabe_intakes i JOIN shirabe_routing_queue q ON q.intake_id=i.id WHERE i.id=?").bind(intakeId).first();
  if (!row) throw new Error("shirabe_intake_not_found");
  if (!shirabeRoutingTransitions[row.routing_status]?.has(nextState)) throw new Error("shirabe_invalid_routing_transition");
  const intakeState = nextState === "completed" ? "closed" : row.intake_status;
  if (!shirabeIntakeStates.has(intakeState)) throw new Error("shirabe_invalid_intake_state");
  const at = new Date().toISOString();
  await env.LEADS["batch"]([
    env.LEADS.prepare("UPDATE shirabe_routing_queue SET status=?,claimed_at=CASE WHEN ?='claimed' THEN ? ELSE claimed_at END,completed_at=CASE WHEN ?='completed' THEN ? ELSE completed_at END,error=CASE WHEN ?='failed' THEN 'governed_review_required' ELSE NULL END WHERE intake_id=? AND status=?").bind(nextState, nextState, at, nextState, at, nextState, intakeId, row.routing_status),
    env.LEADS.prepare("UPDATE shirabe_intakes SET status=?,updated_at=? WHERE id=? AND status=?").bind(intakeState, at, intakeId, row.intake_status),
  ]);
  await recordShirabeEvent(env, intakeId, row.payload_hash, "routing_transitioned", row.routing_status, nextState);
  return { intake_id: intakeId, routing_state: nextState, intake_state: intakeState };
}

export async function purgeExpiredShirabeIntakes(env, now = new Date(), limit = 25) {
  const rows = await env.LEADS.prepare("SELECT id,payload_hash,status FROM shirabe_intakes WHERE retention_expires_at<=? ORDER BY retention_expires_at,id LIMIT ?").bind(now.toISOString(), Math.max(1, Math.min(100, Number(limit) || 25))).all();
  for (const row of rows.results || []) {
    await env.LEADS["batch"]([
      env.LEADS.prepare("UPDATE shirabe_lifecycle_events SET intake_id=NULL,details_json='{}' WHERE intake_id=?").bind(row.id),
      env.LEADS.prepare("INSERT INTO shirabe_lifecycle_events(id,intake_id,payload_hash,event_type,from_state,to_state,details_json,created_at) VALUES(?,NULL,?,'retention_expired',?,'deleted','{}',?)").bind(crypto.randomUUID(), row.payload_hash, row.status, now.toISOString()),
      env.LEADS.prepare("DELETE FROM shirabe_intakes WHERE id=? AND retention_expires_at<=?").bind(row.id, now.toISOString()),
    ]);
  }
  await env.LEADS.prepare("DELETE FROM shirabe_rate_limits WHERE updated_at<?").bind(new Date(now.getTime() - 2 * SHIRABE_RATE_WINDOW_MS).toISOString()).run();
  return { purged: (rows.results || []).length };
}

export async function runShirabeScheduledMaintenance(env, now = new Date()) {
  if (env.DEPLOYMENT_ENV !== "production") return { status: "disabled", reason: "non_production_environment" };
  if (env.SHIRABE_SCHEDULED_RECONCILIATION_ENABLED !== "true") return { status: "disabled", reason: "feature_flag_off" };
  if (!env.LEADS || !env.PILOT_EMAIL) throw new Error("shirabe_scheduled_bindings_missing");
  const configuredLimit = Number(env.SHIRABE_RECONCILIATION_BATCH_LIMIT || 10);
  const limit = Math.max(1, Math.min(25, Number.isSafeInteger(configuredLimit) ? configuredLimit : 10));
  const notifications = await reconcileShirabeNotifications(env, limit, now);
  const retention = await purgeExpiredShirabeIntakes(env, now, limit);
  return {
    status: "completed",
    at: now.toISOString(),
    notification_count: notifications.length,
    purged_count: retention.purged,
  };
}

function shirabeCompleteness(entry) {
  const guided = [
    [entry.problem, 2], [entry.last_example, 1], [entry.trigger, 1], [entry.participants, 1],
    [entry.tools, 1], [entry.source_of_truth, 1], [entry.failure_point, 2], [entry.consequence, 2],
    [entry.evidence_available, 1], [entry.desired_outcome, 2], [entry.attempts, 1], [entry.constraints, 1],
  ];
  const signal = [[entry.problem, 2], [entry.failure_point, 2], [entry.consequence, 2], [entry.desired_outcome, 2]];
  const weighted = entry.mode === "signal" ? signal : guided;
  const earned = weighted.reduce((sum, [value, weight]) => sum + (value.length >= 3 ? weight : 0), 0);
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  return Math.round((earned / total) * 100);
}

async function submitShirabe(request, env) {
  const origin = request.headers.get("origin"), url = new URL(request.url);
  if (!validRequestOrigin(origin, url)) return json({ message: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ message: "Expected JSON." }, 415);
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 32768) return json({ message: "The request is too large." }, 413);
  let body;
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > 32768) return json({ message: "The request is too large." }, 413);
    body = bytes.byteLength ? JSON.parse(new TextDecoder().decode(bytes)) : {};
  } catch { return json({ message: "Invalid request." }, 400); }
  if (clean(body.website, 100)) return json({ ok: true }, 201);
  const started = Number(body.started_at || 0), elapsed = Date.now() - started;
  if (!started || elapsed < 4000 || elapsed > 604800000) return json({ message: "Please reload and try again." }, 400);
  const entry = {
    id: `SHR-${randomHex(8)}`, at: new Date().toISOString(), schema: clean(body.schema, 40),
    language: clean(body.language, 2), mode: clean(body.mode, 12),
    name: clean(body.name, 120), company: clean(body.company, 160), email: clean(body.email, 254).toLowerCase(),
    role: clean(body.role, 120), industry: clean(body.industry, 120), company_size: clean(body.company_size, 40),
    category: clean(body.problem_category, 40), problem: clean(body.problem, 2000), last_example: clean(body.last_example, 1500),
    trigger: clean(body.trigger, 1000), participants: clean(body.participants, 1000), tools: clean(body.tools, 1000),
    source_of_truth: clean(body.source_of_truth, 1000), failure_point: clean(body.failure_point, 1500),
    frequency: clean(body.frequency, 20), monthly_volume: Math.max(0, Math.min(10000000, Number(body.monthly_volume || 0))),
    consequence: clean(body.consequence, 1500), evidence_available: clean(body.evidence_available, 1000),
    claimed_loss_minor: Math.round(Math.max(0, Math.min(1000000000000, Number(body.claimed_loss_amount || 0))) * 100),
    loss_currency: "USD", loss_basis: clean(body.loss_basis, 20), integrity_concern: clean(body.integrity_concern, 30),
    workforce_constraint: clean(body.workforce_constraint, 30), evidence_conflict: clean(body.evidence_conflict, 10),
    disruption: clean(body.disruption, 30),
    desired_outcome: clean(body.desired_outcome, 1500), attempts: clean(body.attempts, 1200), constraints: clean(body.constraints, 1200),
    sensitivity: clean(body.sensitivity, 20), consent: body.consent === true ? 1 : 0,
  };
  if (entry.schema !== "shirabe-intake/v1" || !shirabeLanguages.has(entry.language) || !shirabeModes.has(entry.mode)
    || entry.name.length < 2 || entry.company.length < 2 || entry.role.length < 2 || entry.industry.length < 2
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email) || !shirabeCategories.has(entry.category)
    || entry.problem.length < 20 || entry.failure_point.length < 10 || entry.desired_outcome.length < 10
    || !shirabeFrequencies.has(entry.frequency) || !shirabeSensitivity.has(entry.sensitivity)
    || !shirabeLossBasis.has(entry.loss_basis) || !shirabeIntegrity.has(entry.integrity_concern)
    || !shirabeWorkforce.has(entry.workforce_constraint) || !shirabeEvidenceConflict.has(entry.evidence_conflict)
    || !shirabeDisruptions.has(entry.disruption) || !Number.isSafeInteger(entry.claimed_loss_minor)
    || (entry.claimed_loss_minor > 0 && entry.loss_basis === "unknown") || !entry.consent) {
    return json({ message: "Please complete every required field." }, 400);
  }
  const completeness = shirabeCompleteness(entry);
  const evidenceQuality = completeness >= 85 ? "substantial_self_report" : completeness >= 60 ? "preliminary_self_report" : "limited_self_report";
  const assessment = assessShirabe(entry);
  const routingTier = assessment.routing_tier || (entry.mode === "guided" && completeness >= 80 && entry.consequence.length >= 40 ? "qualified_review" : "clarification_required");
  const { id: _reference, at: _receivedAt, ...evidence } = entry;
  const payload = { ...evidence, completeness, evidence_quality: evidenceQuality, assessment };
  const payloadJson = canonical(payload), payloadHash = await sha256(payloadJson);
  const ip = request.headers.get("cf-connecting-ip") || "";
  const ipHash = ip && env.LEAD_HASH_PEPPER ? await sha256(`${env.LEAD_HASH_PEPPER}:${ip}`) : null;
  let existing;
  try {
    existing = await env.LEADS.prepare("SELECT i.id,i.completeness,i.evidence_quality,i.status,i.notification_message_id,q.routing_tier FROM shirabe_intakes i JOIN shirabe_routing_queue q ON q.intake_id=i.id WHERE i.payload_hash=?").bind(payloadHash).first();
  } catch (error) {
    console.error(JSON.stringify({ event: "shirabe_intake_lookup_failed", message: error?.message }));
    return json({ message: "Your diagnostic could not be saved right now." }, 503);
  }
  if (existing) {
    await recordShirabeEvent(env, existing.id, payloadHash, "duplicate_replayed", existing.status, existing.status);
    if (!existing.notification_message_id) await deliverShirabeNotification(env, existing.id);
    return json({ ok: true, replayed: true, reference: existing.id, completeness: existing.completeness, evidence_quality: existing.evidence_quality, next_state: existing.routing_tier }, 200);
  }
  let rate;
  try { rate = await enforceShirabeRateLimit(env, ipHash); }
  catch (error) {
    console.error(JSON.stringify({ event: "shirabe_rate_limit_failed", message: error?.message }));
    return json({ message: "Your diagnostic could not be saved right now." }, 503);
  }
  if (!rate.allowed) return json({ message: "Too many requests. Please try again later." }, 429, { "retry-after": String(rate.retryAfter) });
  const retentionDays = Math.max(1, Math.min(3650, Number(env.SHIRABE_RETENTION_DAYS || SHIRABE_RETENTION_DAYS_DEFAULT)));
  const retentionExpiresAt = new Date(Date.parse(entry.at) + retentionDays * 86400000).toISOString();
  try {
    await env.LEADS["batch"]([
      env.LEADS.prepare("INSERT INTO shirabe_intakes(id,created_at,schema_version,language,mode,name,company,email,role,industry,company_size,problem_category,frequency,monthly_volume,sensitivity,claimed_loss_minor,loss_currency,loss_basis,integrity_concern,workforce_constraint,evidence_conflict,disruption,completeness,evidence_quality,payload_json,payload_hash,ip_hash,consent,status,updated_at,retention_expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'received',?,?)")
        .bind(entry.id, entry.at, entry.schema, entry.language, entry.mode, entry.name, entry.company, entry.email, entry.role, entry.industry, entry.company_size, entry.category, entry.frequency, entry.monthly_volume, entry.sensitivity, entry.claimed_loss_minor, entry.loss_currency, entry.loss_basis, entry.integrity_concern, entry.workforce_constraint, entry.evidence_conflict, entry.disruption, completeness, evidenceQuality, payloadJson, payloadHash, ipHash, entry.consent, entry.at, retentionExpiresAt),
      env.LEADS.prepare("INSERT INTO shirabe_routing_queue(id,intake_id,created_at,routing_tier,status,payload_hash) VALUES(?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), entry.id, entry.at, routingTier, "pending", payloadHash),
      env.LEADS.prepare("INSERT INTO shirabe_notification_outbox(id,intake_id,idempotency_key,created_at,updated_at,status,next_attempt_at,payload_hash) VALUES(?,?,?,?,?,'pending',?,?)")
        .bind(crypto.randomUUID(), entry.id, `shirabe-owner-notification:${payloadHash}`, entry.at, entry.at, entry.at, payloadHash),
      env.LEADS.prepare("INSERT INTO shirabe_lifecycle_events(id,intake_id,payload_hash,event_type,from_state,to_state,details_json,created_at) VALUES(?,?,?,'received',NULL,'received','{}',?)")
        .bind(crypto.randomUUID(), entry.id, payloadHash, entry.at),
    ]);
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      const replay = await env.LEADS.prepare("SELECT i.id,i.completeness,i.evidence_quality,q.routing_tier FROM shirabe_intakes i JOIN shirabe_routing_queue q ON q.intake_id=i.id WHERE i.payload_hash=?").bind(payloadHash).first();
      if (replay) return json({ ok: true, replayed: true, reference: replay.id, completeness: replay.completeness, evidence_quality: replay.evidence_quality, next_state: replay.routing_tier }, 200);
    }
    console.error(JSON.stringify({ event: "shirabe_intake_insert_failed", message: error?.message }));
    return json({ message: "Your diagnostic could not be saved right now." }, 503);
  }
  const notification = await deliverShirabeNotification(env, entry.id);
  return json({ ok: true, reference: entry.id, completeness, evidence_quality: evidenceQuality, next_state: routingTier, notification: notification.status }, 201);
}

async function handleShirabeAdmin(request, env, path) {
  if (!env.SHIRABE_ADMIN_TOKEN) return json({ message: "SHIRABE administration is not configured." }, 503);
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!(await secretMatches(provided, env.SHIRABE_ADMIN_TOKEN))) return json({ message: "Unauthorized." }, 401);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ message: "Expected JSON." }, 415);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid request." }, 400); }
  const transitionMatch = path.match(/^\/api\/shirabe\/admin\/intakes\/([^/]+)\/routing$/);
  if (transitionMatch) {
    try { return json(await transitionShirabeRouting(env, decodeURIComponent(transitionMatch[1]), clean(body.next_state, 20))); }
    catch (error) {
      if (error?.message === "shirabe_intake_not_found") return json({ message: "Diagnostic not found." }, 404);
      if (error?.message === "shirabe_invalid_routing_transition") return json({ message: "Invalid routing transition." }, 409);
      throw error;
    }
  }
  if (path === "/api/shirabe/admin/reconcile") {
    const notifications = await reconcileShirabeNotifications(env, body.limit);
    const retention = body.purge_expired === true ? await purgeExpiredShirabeIntakes(env, new Date(), body.limit) : { purged: 0 };
    return json({ notifications, retention });
  }
  return json({ message: "Not found." }, 404);
}

async function activateCypher(request, env) {
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ message: "Expected JSON." }, 415);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid activation request." }, 400); }
  const productKey = clean(body.product_key, 80).toUpperCase(), edition = clean(body.edition, 30).toLowerCase(), fingerprint = clean(body.machine_fingerprint, 128).toLowerCase(), installationId = clean(body.installation_id, 64);
  if (body.schema !== "cypher-activation-request/v1" || !productKey || !editions.has(edition) || !/^[a-f0-9]{64}$/.test(fingerprint) || !/^[a-f0-9]{32}$/.test(installationId)) return json({ message: "The activation request is incomplete or invalid." }, 400);
  const keyHash = await sha256(`${env.LICENSE_PEPPER}:${productKey}`), ipHash = await sha256(`${env.LICENSE_PEPPER}:${request.headers.get("cf-connecting-ip") || "unknown"}`);
  const recent = await env.LICENSING.prepare("SELECT COUNT(*) AS total FROM activation_attempts WHERE ip_hash=? AND attempted_at > datetime('now','-15 minutes')").bind(ipHash).first();
  if (Number(recent?.total || 0) >= 30) return json({ message: "Too many activation attempts. Try again later." }, 429, { "retry-after": "900" });
  const license = await env.LICENSING.prepare("SELECT * FROM product_keys WHERE key_hash=?").bind(keyHash).first();
  await env.LICENSING.prepare("INSERT INTO activation_attempts(id,key_hash,ip_hash,success,attempted_at) VALUES(?,?,?,?,datetime('now'))").bind(crypto.randomUUID(), keyHash, ipHash, license ? 1 : 0).run();
  if (!license || license.status !== "active") return json({ message: "The product key is invalid or revoked." }, 403);
  if (license.edition !== edition) return json({ message: `This key is for the ${license.edition} edition.` }, 409);
  if (license.valid_until && license.valid_until < new Date().toISOString().slice(0, 10)) return json({ message: "This product key has expired." }, 403);
  const known = await env.LICENSING.prepare("SELECT id FROM activations WHERE key_hash=? AND machine_fingerprint=? AND deactivated_at IS NULL").bind(keyHash, fingerprint).first();
  const count = await env.LICENSING.prepare("SELECT COUNT(*) AS total FROM activations WHERE key_hash=? AND deactivated_at IS NULL").bind(keyHash).first();
  if (!known && Number(count?.total || 0) >= Number(license.machine_limit)) return json({ message: "This license has reached its computer limit. Contact Shikigami to transfer a seat." }, 409);
  if (!known) await env.LICENSING.prepare("INSERT INTO activations(id,key_hash,installation_id,machine_fingerprint,activated_at) VALUES(?,?,?,?,datetime('now'))").bind(crypto.randomUUID(), keyHash, installationId, fingerprint).run();
  const fingerprints = (await env.LICENSING.prepare("SELECT machine_fingerprint FROM activations WHERE key_hash=? AND deactivated_at IS NULL").bind(keyHash).all()).results.map((row) => row.machine_fingerprint);
  const today = new Date().toISOString().slice(0, 10), payload = { schema: "cypher-license/v1", license_id: `LIC-${randomHex(8)}`, product_key: productKey, customer: license.customer, edition: license.edition, installation_limit: Number(license.machine_limit), machine_fingerprints: fingerprints, issued_at: today, subscription_expires_at: isoDateAfter(license.term_days), maintenance_expires_at: isoDateAfter(license.term_days), grace_days: Number(license.grace_days), additional_entitlements: [] };
  const signature = await signLicense(payload, env.LICENSE_SIGNING_KEY_PEM);
  await env.LICENSING.prepare("INSERT INTO audit_events(id,event_type,key_hash,details,created_at) VALUES(?,?,?,?,datetime('now'))").bind(crypto.randomUUID(), "license_activated", keyHash, JSON.stringify({ installation_id: installationId, machine_fingerprint: fingerprint })).run();
  return json({ license: payload, signature });
}

async function createBatch(request, env) {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!(await secretMatches(provided, env.LICENSE_ADMIN_TOKEN))) return json({ message: "Unauthorized." }, 401);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid request." }, 400); }
  const edition = clean(body.edition, 30).toLowerCase(), customer = clean(body.customer || "Unassigned inventory", 160), quantity = Math.min(100, Math.max(1, Number(body.quantity || 1))), machines = Math.min(500, Math.max(1, Number(body.machines || 2))), termDays = Math.min(3650, Math.max(1, Number(body.term_days || 365))), graceDays = Math.min(180, Math.max(0, Number(body.grace_days ?? 30)));
  if (!editions.has(edition)) return json({ message: "Unknown edition." }, 400);
  const generated = [];
  for (let index = 0; index < quantity; index++) { const productKey = `CYP-${edition.slice(0, 3).toUpperCase()}-${randomHex(3)}-${randomHex(3)}`, keyHash = await sha256(`${env.LICENSE_PEPPER}:${productKey}`); await env.LICENSING.prepare("INSERT INTO product_keys(key_hash,key_hint,customer,edition,machine_limit,term_days,grace_days,status,created_at) VALUES(?,?,?,?,?,?,?,'active',datetime('now'))").bind(keyHash, productKey.slice(-6), customer, edition, machines, termDays, graceDays).run(); generated.push(productKey); }
  await env.LICENSING.prepare("INSERT INTO audit_events(id,event_type,key_hash,details,created_at) VALUES(?,?,?,?,datetime('now'))").bind(crypto.randomUUID(), "batch_created", null, JSON.stringify({ edition, quantity, customer, machines, term_days: termDays })).run();
  return json({ edition, quantity, customer, product_keys: generated }, 201);
}

function methodNotAllowed(allow) { return json({ message: "Method not allowed." }, 405, { allow }); }

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (env.DEPLOYMENT_ENV === "staging" && path.startsWith("/api/")) return json({ message: "Provider APIs are disabled in public staging." }, 503);
      if (path === "/robots.txt") return new Response("User-agent: *\nAllow: /\nSitemap: https://shikigamitechnologies.com/sitemap.xml\n", { headers: { "content-type": "text/plain;charset=utf-8", ...securityHeaders } });
      if (path === "/sitemap.xml") { const entries = publicPaths.map((value) => `<url><loc>https://shikigamitechnologies.com${value}</loc></url>`).join(""); return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`, { headers: { "content-type": "application/xml;charset=utf-8", "cache-control": "public,max-age=3600", ...securityHeaders } }); }
      if (path === "/api/anor-beta") return request.method === "POST" ? submitAnor(request, env) : methodNotAllowed("POST");
      if (path === "/api/pilot-interest") return request.method === "POST" ? submitPilotInterest(request, env) : methodNotAllowed("POST");
      if (path === "/api/shirabe-intake") return request.method === "POST" ? submitShirabe(request, env) : methodNotAllowed("POST");
      if (path.startsWith("/api/shirabe/admin/")) return request.method === "POST" ? handleShirabeAdmin(request, env, path) : methodNotAllowed("POST");
      if (path === "/api/cypher/v1/activate") return request.method === "POST" ? activateCypher(request, env) : methodNotAllowed("POST");
      if (path === "/api/cypher/admin/v1/product-keys/batch") return request.method === "POST" ? createBatch(request, env) : methodNotAllowed("POST");
      if (path === "/api/cypher/v1" || path.startsWith("/api/cypher/v1/")) return await handleCypherSupabaseRoute(request, env);
      const asset = await env.ASSETS.fetch(request), response = new Response(asset.body, asset);
      for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
      return response;
    } catch (error) {
      console.error(JSON.stringify({ event: "worker_request_failed", path, message: error?.message }));
      return json({ message: "The service is temporarily unavailable." }, 503);
    }
  },
  async scheduled(_controller, env, context) {
    context.waitUntil(runShirabeScheduledMaintenance(env));
  },
};
