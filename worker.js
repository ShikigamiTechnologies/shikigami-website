import { handleCypherSupabaseRoute } from "./lib/cypher-supabase-adapter.js";
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
const publicPaths = ["/", "/cypher", "/anor", "/ironcrew", "/kizuna", "/pricing-themis", "/privacy", "/security", "/terms", "/acceptable-use"];
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
};
