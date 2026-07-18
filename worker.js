const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json;charset=utf-8", "cache-control": "no-store",
    "x-content-type-options": "nosniff", ...extra },
});
const clean = (value, length) => String(value || "").trim().slice(0, length);
const editions = new Set(["core", "operations", "enterprise", "government", "federal"]);
const sizes = new Set(["1–19", "20–49", "50–199", "200–500", "501+"]);
const contracts = new Set(["None yet", "1–3", "4–10", "11–25", "26+"]);
const encoder = new TextEncoder();

function bytesToHex(bytes) { return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function bytesToBase64(bytes) {
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function sha256(value) { return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))); }
function randomHex(bytes = 8) { const value = new Uint8Array(bytes); crypto.getRandomValues(value); return bytesToHex(value).toUpperCase(); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function pemToDer(pem) {
  return base64ToBytes(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ""));
}
async function signLicense(payload, privateKeyPem) {
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(privateKeyPem), { name: "Ed25519" }, false, ["sign"]);
  return bytesToBase64(new Uint8Array(await crypto.subtle.sign("Ed25519", key, encoder.encode(canonical(payload)))));
}
async function secretMatches(provided, expected) {
  const [left, right] = await Promise.all([sha256(provided || ""), sha256(expected || "")]);
  return crypto.subtle.timingSafeEqual(encoder.encode(left), encoder.encode(right));
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
  const entry = { id: crypto.randomUUID(), at: new Date().toISOString(), name: clean(body.name, 120),
    email: clean(body.email, 254).toLowerCase(), company: clean(body.company, 160), role: clean(body.role, 120),
    size: clean(body.company_size, 40), contracts: clean(body.active_contracts, 40), tools: clean(body.current_tools, 500),
    pain: clean(body.pain_point, 2000), consent: body.consent === true ? 1 : 0 };
  if (entry.name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email) || entry.company.length < 2 ||
      entry.role.length < 2 || !sizes.has(entry.size) || !contracts.has(entry.contracts) || entry.tools.length < 2 ||
      entry.pain.length < 20 || !entry.consent) return json({ message: "Please complete every required field." }, 400);
  try {
    await env.LEADS.prepare("INSERT INTO anor_beta_applications (id,created_at,name,email,company,role,company_size,active_contracts,current_tools,pain_point,consent) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(entry.id, entry.at, entry.name, entry.email, entry.company, entry.role, entry.size, entry.contracts, entry.tools, entry.pain, entry.consent).run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) return json({ message: "This email already has a request on file." }, 409);
    console.error(JSON.stringify({ event: "anor_insert_failed", message: error?.message }));
    return json({ message: "The request could not be saved right now." }, 503);
  }
  return json({ ok: true }, 201);
}

async function activateCypher(request, env) {
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ message: "Expected JSON." }, 415);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid activation request." }, 400); }
  const productKey = clean(body.product_key, 80).toUpperCase();
  const edition = clean(body.edition, 30).toLowerCase();
  const fingerprint = clean(body.machine_fingerprint, 128).toLowerCase();
  const installationId = clean(body.installation_id, 64);
  if (body.schema !== "cypher-activation-request/v1" || !productKey || !editions.has(edition) ||
      !/^[a-f0-9]{64}$/.test(fingerprint) || !/^[a-f0-9]{32}$/.test(installationId)) {
    return json({ message: "The activation request is incomplete or invalid." }, 400);
  }
  const keyHash = await sha256(`${env.LICENSE_PEPPER}:${productKey}`);
  const ipHash = await sha256(`${env.LICENSE_PEPPER}:${request.headers.get("cf-connecting-ip") || "unknown"}`);
  const recent = await env.LICENSING.prepare("SELECT COUNT(*) AS total FROM activation_attempts WHERE ip_hash=? AND attempted_at > datetime('now','-15 minutes')").bind(ipHash).first();
  if (Number(recent?.total || 0) >= 30) return json({ message: "Too many activation attempts. Try again later." }, 429, { "retry-after": "900" });
  const license = await env.LICENSING.prepare("SELECT * FROM product_keys WHERE key_hash=?").bind(keyHash).first();
  await env.LICENSING.prepare("INSERT INTO activation_attempts(id,key_hash,ip_hash,success,attempted_at) VALUES(?,?,?,?,datetime('now'))")
    .bind(crypto.randomUUID(), keyHash, ipHash, license ? 1 : 0).run();
  if (!license || license.status !== "active") return json({ message: "The product key is invalid or revoked." }, 403);
  if (license.edition !== edition) return json({ message: `This key is for the ${license.edition} edition.` }, 409);
  if (license.valid_until && license.valid_until < new Date().toISOString().slice(0, 10)) return json({ message: "This product key has expired." }, 403);
  const known = await env.LICENSING.prepare("SELECT id FROM activations WHERE key_hash=? AND machine_fingerprint=? AND deactivated_at IS NULL")
    .bind(keyHash, fingerprint).first();
  const count = await env.LICENSING.prepare("SELECT COUNT(*) AS total FROM activations WHERE key_hash=? AND deactivated_at IS NULL").bind(keyHash).first();
  if (!known && Number(count?.total || 0) >= Number(license.machine_limit)) return json({ message: "This license has reached its computer limit. Contact Shikigami to transfer a seat." }, 409);
  if (!known) await env.LICENSING.prepare("INSERT INTO activations(id,key_hash,installation_id,machine_fingerprint,activated_at) VALUES(?,?,?,?,datetime('now'))")
    .bind(crypto.randomUUID(), keyHash, installationId, fingerprint).run();
  const fingerprints = (await env.LICENSING.prepare("SELECT machine_fingerprint FROM activations WHERE key_hash=? AND deactivated_at IS NULL").bind(keyHash).all()).results.map((row) => row.machine_fingerprint);
  const today = new Date().toISOString().slice(0, 10);
  const payload = { schema: "cypher-license/v1", license_id: `LIC-${randomHex(8)}`, product_key: productKey,
    customer: license.customer, edition: license.edition, installation_limit: Number(license.machine_limit),
    machine_fingerprints: fingerprints, issued_at: today, subscription_expires_at: isoDateAfter(license.term_days),
    maintenance_expires_at: isoDateAfter(license.term_days), grace_days: Number(license.grace_days), additional_entitlements: [] };
  const signature = await signLicense(payload, env.LICENSE_SIGNING_KEY_PEM);
  await env.LICENSING.prepare("INSERT INTO audit_events(id,event_type,key_hash,details,created_at) VALUES(?,?,?,?,datetime('now'))")
    .bind(crypto.randomUUID(), "license_activated", keyHash, JSON.stringify({ installation_id: installationId, machine_fingerprint: fingerprint })).run();
  return json({ license: payload, signature });
}

async function createBatch(request, env) {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!(await secretMatches(provided, env.LICENSE_ADMIN_TOKEN))) return json({ message: "Unauthorized." }, 401);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid request." }, 400); }
  const edition = clean(body.edition, 30).toLowerCase(), customer = clean(body.customer || "Unassigned inventory", 160);
  const quantity = Math.min(100, Math.max(1, Number(body.quantity || 1))), machines = Math.min(500, Math.max(1, Number(body.machines || 2)));
  const termDays = Math.min(3650, Math.max(1, Number(body.term_days || 365))), graceDays = Math.min(180, Math.max(0, Number(body.grace_days ?? 30)));
  if (!editions.has(edition)) return json({ message: "Unknown edition." }, 400);
  const generated = [];
  for (let index = 0; index < quantity; index++) {
    const productKey = `CYP-${edition.slice(0, 3).toUpperCase()}-${randomHex(3)}-${randomHex(3)}`;
    const keyHash = await sha256(`${env.LICENSE_PEPPER}:${productKey}`);
    await env.LICENSING.prepare("INSERT INTO product_keys(key_hash,key_hint,customer,edition,machine_limit,term_days,grace_days,status,created_at) VALUES(?,?,?,?,?,?,?,'active',datetime('now'))")
      .bind(keyHash, productKey.slice(-6), customer, edition, machines, termDays, graceDays).run();
    generated.push(productKey);
  }
  await env.LICENSING.prepare("INSERT INTO audit_events(id,event_type,key_hash,details,created_at) VALUES(?,?,?,?,datetime('now'))")
    .bind(crypto.randomUUID(), "batch_created", null, JSON.stringify({ edition, quantity, customer, machines, term_days: termDays })).run();
  return json({ edition, quantity, customer, product_keys: generated }, 201);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (path === "/api/anor-beta") {
        if (request.method === "POST") return await submitAnor(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "POST" });
      }
      if (path === "/api/cypher/v1/activate") {
        if (request.method === "POST") return await activateCypher(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "POST" });
      }
      if (path === "/api/cypher/admin/v1/product-keys/batch") {
        if (request.method === "POST") return await createBatch(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "POST" });
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({ event: "worker_request_failed", path, message: error?.message }));
      return json({ message: "The service is temporarily unavailable." }, 503);
    }
  },
};
