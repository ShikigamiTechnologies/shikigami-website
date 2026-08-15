import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
const publicPaths = ["/", "/cypher", "/anor", "/ironcrew", "/kizuna", "/pricing-themis", "/privacy", "/security", "/terms", "/acceptable-use"];
const securityHeaders = {
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' mailto:; object-src 'none'; upgrade-insecure-requests",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
};
const PASSWORD_ITERATIONS = 100000;
const SESSION_SECONDS = 8 * 60 * 60;
const SESSION_COOKIE = "cypher_session";
const PLATFORM_SESSION_COOKIE = "cypher_platform_session";

function bytesToHex(bytes) { return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function bytesToBase64(bytes) {
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function constantTimeEqual(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}
async function sha256(value) { return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))); }
async function sha256Digest(value) { return crypto.subtle.digest("SHA-256", value); }
async function sha256Bytes(value) { return bytesToHex(new Uint8Array(await sha256Digest(value))); }
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
  return constantTimeEqual(encoder.encode(left), encoder.encode(right));
}
function isoDateAfter(days) { const value = new Date(); value.setUTCDate(value.getUTCDate() + Number(days)); return value.toISOString().slice(0, 10); }

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const requestOrigin = new URL(request.url).origin;
  return new Set([requestOrigin, "https://shikigamitechnologies.com", "https://www.shikigamitechnologies.com"]).has(origin);
}
function bytesToBase64Url(bytes) { return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function base64UrlToBytes(value) { const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/"); return base64ToBytes(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")); }
function parseCookies(request) {
  return Object.fromEntries((request.headers.get("cookie") || "").split(";").map((item) => item.trim()).filter(Boolean)
    .map((item) => { const split = item.indexOf("="); return [item.slice(0, split), decodeURIComponent(item.slice(split + 1))]; }));
}
function randomToken(bytes = 32) { const value = new Uint8Array(bytes); crypto.getRandomValues(value); return bytesToBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function authCookie(token, maxAge = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
function platformAuthCookie(token, maxAge = SESSION_SECONDS) {
  return `${PLATFORM_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
async function passwordHash(password, salt, iterations = PASSWORD_ITERATIONS) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(salt), iterations }, material, 256);
  return bytesToBase64(new Uint8Array(bits));
}
async function verifyPassword(password, user) {
  if (!password || password.length > 128 || Number(user.password_iterations) < PASSWORD_ITERATIONS) return false;
  const candidate = base64ToBytes(await passwordHash(password, user.password_salt, Number(user.password_iterations)));
  const expected = base64ToBytes(user.password_hash);
  return constantTimeEqual(candidate, expected);
}
async function requestFingerprint(request, env) {
  const pepper = env.PLATFORM_AUTH_PEPPER || env.CYPHER_AUTH_PEPPER || env.LICENSE_PEPPER;
  if (!pepper) throw new Error("CYPHER_AUTH_PEPPER is not configured");
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  return { ipHash: await sha256(`${pepper}:ip:${ip}`), userAgentHash: await sha256(`${pepper}:ua:${request.headers.get("user-agent") || "unknown"}`) };
}
async function currentSession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || token.length > 128) return null;
  const tokenHash = await sha256(token);
  return env.CYPHER.prepare(`SELECT s.id AS session_id,s.tenant_id,s.user_id,s.expires_at,
    t.slug AS tenant_slug,t.display_name AS tenant_name,t.status AS tenant_status,
    u.email,u.display_name,u.status AS user_status,u.must_change_password,m.role,m.status AS membership_status,
    sub.plan_code,sub.status AS subscription_status
    FROM auth_sessions s JOIN tenants t ON t.id=s.tenant_id JOIN users u ON u.id=s.user_id
    JOIN tenant_memberships m ON m.tenant_id=s.tenant_id AND m.user_id=s.user_id
    LEFT JOIN tenant_subscriptions sub ON sub.tenant_id=s.tenant_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>datetime('now')`).bind(tokenHash).first();
}
async function listCypherCompanies(env) {
  const result = await env.CYPHER.prepare("SELECT slug,display_name FROM tenants WHERE status='active' AND login_enabled=1 ORDER BY display_name").all();
  return json({ companies: result.results || [] });
}
async function loginCypher(request, env) {
  let authStage = "request_validation";
  try {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ message: "Expected JSON." }, 415);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid sign-in request." }, 400); }
  const tenantSlug = clean(body.company, 64).toLowerCase();
  const email = clean(body.email, 254).toLowerCase();
  const password = String(body.password || "");
  authStage = "fingerprint";
  const fingerprint = await requestFingerprint(request, env);
  authStage = "rate_limit";
  const emailHash = await sha256(`${env.CYPHER_AUTH_PEPPER || env.LICENSE_PEPPER}:email:${email}`);
  const [recentIp, recentAccount] = await Promise.all([
    env.CYPHER.prepare("SELECT COUNT(*) AS total FROM auth_attempts WHERE ip_hash=? AND success=0 AND attempted_at>datetime('now','-15 minutes')").bind(fingerprint.ipHash).first(),
    env.CYPHER.prepare("SELECT COUNT(*) AS total FROM auth_attempts WHERE tenant_slug=? AND email_hash=? AND success=0 AND attempted_at>datetime('now','-15 minutes')").bind(tenantSlug, emailHash).first(),
  ]);
  if (Number(recentIp?.total || 0) >= 50 || Number(recentAccount?.total || 0) >= 10) {
    return json({ message: "Too many sign-in attempts. Try again later." }, 429, { "retry-after": "900" });
  }
  authStage = "account_lookup";
  const account = await env.CYPHER.prepare(`SELECT u.*,u.status AS user_status,t.id AS tenant_id,t.slug AS tenant_slug,t.display_name AS tenant_name,
    t.status AS tenant_status,t.login_enabled,m.role,m.status AS membership_status
    FROM users u JOIN tenant_memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id
    WHERE lower(u.email)=? AND t.slug=?`).bind(email, tenantSlug).first();
  authStage = "password_verify";
  const valid = account && account.user_status !== "disabled" && account.status === "active" && account.tenant_status === "active" &&
    Number(account.login_enabled) === 1 && account.membership_status === "active" && await verifyPassword(password, account);
  authStage = "attempt_record";
  await env.CYPHER.prepare("INSERT INTO auth_attempts(id,tenant_slug,email_hash,ip_hash,success) VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(), tenantSlug, emailHash, fingerprint.ipHash, valid ? 1 : 0).run();
  if (!valid) return json({ message: "The company, email, or password is incorrect." }, 401);
  authStage = "session_create";
  const token = randomToken();
  const tokenHash = await sha256(token);
  const sessionId = crypto.randomUUID();
  await env.CYPHER.batch([
    env.CYPHER.prepare("INSERT INTO auth_sessions(id,token_hash,tenant_id,user_id,expires_at,ip_hash,user_agent_hash) VALUES(?,?,?,?,datetime('now',?),?,?)")
      .bind(sessionId, tokenHash, account.tenant_id, account.id, `+${SESSION_SECONDS} seconds`, fingerprint.ipHash, fingerprint.userAgentHash),
    env.CYPHER.prepare("UPDATE users SET last_login_at=datetime('now'),updated_at=datetime('now') WHERE id=?").bind(account.id),
    env.CYPHER.prepare("INSERT INTO cypher_audit_events(id,tenant_id,actor_user_id,event_type,details) VALUES(?,?,?,'user_signed_in','{}')")
      .bind(crypto.randomUUID(), account.tenant_id, account.id),
  ]);
  return json({ ok: true, account: { display_name: account.display_name, company: account.tenant_name, role: account.role, must_change_password: Boolean(account.must_change_password) } }, 200,
    { "set-cookie": authCookie(token) });
  } catch (error) {
    console.error(JSON.stringify({ event: "cypher_login_failed", stage: authStage, message: error?.message }));
    const diagnostic = clean(error?.code || error?.name || "UNKNOWN", 48).replace(/[^A-Za-z0-9_-]/g, "_").toUpperCase();
    return json({ message: "The service is temporarily unavailable.", code: `AUTH_${authStage.toUpperCase()}_${diagnostic}` }, 503);
  }
}
async function getCypherSession(request, env) {
  const session = await currentSession(request, env);
  if (!session || session.user_status !== "active" || session.tenant_status !== "active" || session.membership_status !== "active") {
    return json({ authenticated: false }, 401, { "set-cookie": authCookie("", 0) });
  }
  return json({ authenticated: true, account: { display_name: session.display_name, email: session.email, company: session.tenant_name,
    company_slug: session.tenant_slug, role: session.role, plan: session.plan_code || "unprovisioned",
    subscription_status: session.subscription_status || "unprovisioned", must_change_password: Boolean(session.must_change_password) } });
}
async function logoutCypher(request, env) {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) await env.CYPHER.prepare("UPDATE auth_sessions SET revoked_at=datetime('now') WHERE token_hash=? AND revoked_at IS NULL").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "set-cookie": authCookie("", 0) });
}

async function authorizedSession(request, env, roles = null) {
  const session = await currentSession(request, env);
  if (!session || session.user_status !== "active" || session.tenant_status !== "active" || session.membership_status !== "active") return null;
  if (roles && !roles.includes(session.role)) return null;
  return session;
}
async function getCypherOverview(request, env) {
  const session = await authorizedSession(request, env);
  if (!session) return json({ message: "Unauthorized." }, 401);
  await refreshExposureAging(env, session.tenant_id);
  const [statusRows, debt, stores, activity, entitlements] = await Promise.all([
    env.CYPHER.prepare("SELECT status,COUNT(*) AS total FROM documents WHERE tenant_id=? GROUP BY status").bind(session.tenant_id).all(),
    env.CYPHER.prepare("SELECT COALESCE(SUM(amount_minor),0) AS total_minor,COUNT(*) AS documents FROM document_exposure WHERE tenant_id=? AND classification IN ('confirmed_outstanding','overdue')").bind(session.tenant_id).first(),
    env.CYPHER.prepare("SELECT COUNT(*) AS total FROM stores WHERE tenant_id=? AND status='active'").bind(session.tenant_id).first(),
    env.CYPHER.prepare(`SELECT event_type,details,created_at FROM cypher_audit_events
      WHERE tenant_id=? ORDER BY created_at DESC LIMIT 8`).bind(session.tenant_id).all(),
    env.CYPHER.prepare("SELECT feature_code,enabled,limit_value FROM tenant_entitlements WHERE tenant_id=? ORDER BY feature_code").bind(session.tenant_id).all(),
  ]);
  const counts = Object.fromEntries((statusRows.results || []).map((row) => [row.status, Number(row.total)]));
  return json({ overview: {
    total_documents: Object.values(counts).reduce((sum, value) => sum + value, 0),
    needs_review: Number(counts.needs_review || 0), unmatched: Number(counts.unmatched || 0),
    validated: Number(counts.validated || 0), failed: Number(counts.failed || 0),
    outstanding_minor: Number(debt?.total_minor || 0), outstanding_documents: Number(debt?.documents || 0),
    active_stores: Number(stores?.total || 0), currency: "USD",
  }, activity: activity.results || [], entitlements: entitlements.results || [] });
}
async function refreshExposureAging(env, tenantId) {
  await env.CYPHER.batch([
    env.CYPHER.prepare("UPDATE document_exposure SET classification='overdue',resolution_required=1,updated_at=datetime('now') WHERE tenant_id=? AND classification='confirmed_outstanding' AND due_at IS NOT NULL AND date(due_at)<=date('now')").bind(tenantId),
    env.CYPHER.prepare("UPDATE document_exposure SET resolution_required=1,updated_at=datetime('now') WHERE tenant_id=? AND classification IN ('unmatched','disputed','possible_duplicate') AND due_at IS NOT NULL AND date(due_at)<=date('now')").bind(tenantId),
  ]);
}
async function getCypherSettings(request, env) {
  const session = await authorizedSession(request, env);
  if (!session) return json({ message: "Unauthorized." }, 401);
  const settings = await env.CYPHER.prepare("SELECT * FROM tenant_settings WHERE tenant_id=?").bind(session.tenant_id).first();
  return json({ settings: settings || null, editable: session.role === "tenant_admin" });
}
async function patchCypherSettings(request, env) {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  const session = await authorizedSession(request, env, ["tenant_admin"]);
  if (!session) return json({ message: "Tenant administrator access required." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ message: "Expected JSON." }, 415);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid settings request." }, 400); }
  const allowedLanguages = new Set(["english","spanish","bilingual"]), allowedBranding = new Set(["cypher","tenant","both"]);
  const values = {
    currency: clean(body.currency, 3).toUpperCase(), timezone: clean(body.timezone, 80),
    language_mode: clean(body.language_mode, 20).toLowerCase(), fiscal_year_start_month: Number(body.fiscal_year_start_month),
    confidence_threshold: Number(body.confidence_threshold), auto_match_enabled: body.auto_match_enabled === true ? 1 : 0,
    retroactive_match_enabled: body.retroactive_match_enabled === true ? 1 : 0,
    resolution_required_days: Number(body.resolution_required_days), canonical_supplier: clean(body.canonical_supplier, 200),
    report_branding: clean(body.report_branding, 20).toLowerCase(), weekly_summary_enabled: body.weekly_summary_enabled === true ? 1 : 0,
  };
  if (!/^[A-Z]{3}$/.test(values.currency) || !values.timezone || !allowedLanguages.has(values.language_mode) ||
      !Number.isInteger(values.fiscal_year_start_month) || values.fiscal_year_start_month < 1 || values.fiscal_year_start_month > 12 ||
      values.confidence_threshold < 0.70 || values.confidence_threshold > 0.99 || !Number.isInteger(values.resolution_required_days) ||
      values.resolution_required_days < 1 || values.resolution_required_days > 365 || !allowedBranding.has(values.report_branding)) {
    return json({ message: "One or more settings are invalid." }, 400);
  }
  await env.CYPHER.prepare(`INSERT INTO tenant_settings(tenant_id,currency,timezone,language_mode,fiscal_year_start_month,
    confidence_threshold,auto_match_enabled,retroactive_match_enabled,resolution_required_days,canonical_supplier,report_branding,
    weekly_summary_enabled,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(tenant_id) DO UPDATE SET currency=excluded.currency,timezone=excluded.timezone,language_mode=excluded.language_mode,
    fiscal_year_start_month=excluded.fiscal_year_start_month,confidence_threshold=excluded.confidence_threshold,
    auto_match_enabled=excluded.auto_match_enabled,retroactive_match_enabled=excluded.retroactive_match_enabled,
    resolution_required_days=excluded.resolution_required_days,canonical_supplier=excluded.canonical_supplier,
    report_branding=excluded.report_branding,weekly_summary_enabled=excluded.weekly_summary_enabled,
    updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(session.tenant_id, values.currency, values.timezone, values.language_mode, values.fiscal_year_start_month,
      values.confidence_threshold, values.auto_match_enabled, values.retroactive_match_enabled, values.resolution_required_days,
      values.canonical_supplier || null, values.report_branding, values.weekly_summary_enabled, session.user_id).run();
  await env.CYPHER.prepare("INSERT INTO cypher_audit_events(id,tenant_id,actor_user_id,event_type,details) VALUES(?,?,?,'tenant_settings_updated',?)")
    .bind(crypto.randomUUID(), session.tenant_id, session.user_id, JSON.stringify({ fields: Object.keys(values) })).run();
  return json({ ok: true });
}
async function listFieldDefinitions(request, env) {
  const session = await authorizedSession(request, env); if (!session) return json({ message: "Unauthorized." }, 401);
  const result = await env.CYPHER.prepare("SELECT id,field_key,field_label,category,is_required,active,created_at FROM tenant_field_definitions WHERE tenant_id=? ORDER BY active DESC,field_label").bind(session.tenant_id).all();
  return json({ fields: result.results || [], editable: session.role === "tenant_admin" });
}
async function createFieldDefinition(request, env) {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  const session = await authorizedSession(request, env, ["tenant_admin"]); if (!session) return json({ message: "Tenant administrator access required." }, 403);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid field request." }, 400); }
  const label = clean(body.field_label, 100), category = clean(body.category || "custom", 60);
  const key = clean(body.field_key || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), 80);
  if (!label || !/^[a-z][a-z0-9_]{1,79}$/.test(key) || EXTRACTION_KEYS.includes(key)) return json({ message: "Use a unique field name containing letters, numbers, and underscores." }, 400);
  await env.CYPHER.prepare(`INSERT INTO tenant_field_definitions(id,tenant_id,field_key,field_label,category,is_required,created_by)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(tenant_id,field_key) DO UPDATE SET field_label=excluded.field_label,category=excluded.category,is_required=excluded.is_required,active=1,updated_at=datetime('now')`)
    .bind(crypto.randomUUID(), session.tenant_id, key, label, category || "custom", body.is_required === true ? 1 : 0, session.user_id).run();
  await auditTenant(env, session, "custom_field_saved", { field_key: key, field_label: label }); return json({ ok: true, field_key: key }, 201);
}
async function deleteFieldDefinition(request, env, fieldId) {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  const session = await authorizedSession(request, env, ["tenant_admin"]); if (!session) return json({ message: "Tenant administrator access required." }, 403);
  const result = await env.CYPHER.prepare("UPDATE tenant_field_definitions SET active=0,updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(fieldId, session.tenant_id).run();
  if (!result.meta.changes) return json({ message: "Field not found." }, 404); await auditTenant(env, session, "custom_field_disabled", { field_id: fieldId }); return json({ ok: true });
}
function csvCell(value) { const text = String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
async function exportCypherDocuments(request, env) {
  const session = await authorizedSession(request, env); if (!session) return json({ message: "Unauthorized." }, 401);
  const result = await env.CYPHER.prepare(`SELECT d.document_type,d.status,d.original_filename,d.invoice_number,d.po_number,s.store_number,
    v.legal_name AS vendor,d.document_date,d.invoice_total_minor,d.po_total_minor,d.tax_total_minor,d.currency,d.match_status,d.difference_minor,
    d.extraction_confidence,d.uploaded_at,d.validated_at,u.display_name AS validated_by,e.classification AS exposure_classification,e.amount_minor AS exposure_minor,e.due_at,e.resolution_required
    FROM documents d LEFT JOIN stores s ON s.id=d.store_id LEFT JOIN vendors v ON v.id=d.vendor_id LEFT JOIN users u ON u.id=d.validated_by
    LEFT JOIN document_exposure e ON e.document_id=d.id AND e.tenant_id=d.tenant_id WHERE d.tenant_id=? ORDER BY d.uploaded_at DESC`).bind(session.tenant_id).all();
  const headers = ["Document Type","Status","Original File","Invoice Number","PO Number","Store","Vendor","Document Date","Invoice Total","PO Total","Tax Total","Currency","Match Status","Difference","Confidence","Uploaded At","Validated At","Validated By","Exposure","Exposure Amount","Due Date","Resolution Required"];
  const rows = (result.results || []).map((row) => [row.document_type,row.status,row.original_filename,row.invoice_number,row.po_number,row.store_number,row.vendor,row.document_date,row.invoice_total_minor == null ? "" : row.invoice_total_minor / 100,row.po_total_minor == null ? "" : row.po_total_minor / 100,row.tax_total_minor == null ? "" : row.tax_total_minor / 100,row.currency,row.match_status,row.difference_minor == null ? "" : row.difference_minor / 100,row.extraction_confidence,row.uploaded_at,row.validated_at,row.validated_by,row.exposure_classification,row.exposure_minor == null ? "" : row.exposure_minor / 100,row.due_at,row.resolution_required ? "Yes" : "No"]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  await auditTenant(env, session, "document_register_exported", { format: "csv", rows: rows.length });
  return new Response(csv, { headers: { "content-type": "text/csv;charset=utf-8", "content-disposition": `attachment; filename="Cypher-Document-Register-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

const DOCUMENT_ROLES = ["secretary", "supervisor", "tenant_admin"];
const REVIEW_ROLES = ["secretary", "supervisor", "tenant_admin"];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

function safeFilename(value) {
  const name = clean(value, 180).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "");
  return name || "document.pdf";
}
function isPdf(bytes) { return PDF_SIGNATURE.every((value, index) => bytes[index] === value); }
function documentObjectPrefix(session, documentId, storeNumber = "PENDING") {
  const now = new Date();
  return `tenants/${session.tenant_slug}/stores/${clean(storeNumber, 30) || "PENDING"}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${documentId}`;
}
function activeSubscription(session) { return ["trialing", "active"].includes(session.subscription_status); }
async function auditTenant(env, session, eventType, details, documentId = null) {
  await env.CYPHER.prepare("INSERT INTO cypher_audit_events(id,tenant_id,actor_user_id,event_type,details) VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(), session.tenant_id, session.user_id, eventType, JSON.stringify({ ...(details || {}), document_id: documentId })).run();
}
async function createCypherDocument(request, env) {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  const session = await authorizedSession(request, env, DOCUMENT_ROLES);
  if (!session) return json({ message: "Document intake access required." }, 403);
  if (!activeSubscription(session)) return json({ message: "This workspace is not provisioned for document intake." }, 402);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/pdf") return json({ message: "Only PDF documents are accepted." }, 415);
  const declared = Number(request.headers.get("content-length") || 0), maximum = Number(env.CYPHER_MAX_UPLOAD_BYTES || 15728640);
  if (declared > maximum) return json({ message: `The PDF exceeds the ${Math.floor(maximum / 1048576)} MB upload limit.` }, 413);
  const buffer = await request.arrayBuffer();
  if (!buffer.byteLength || buffer.byteLength > maximum) return json({ message: "The PDF is empty or exceeds the upload limit." }, buffer.byteLength ? 413 : 400);
  const bytes = new Uint8Array(buffer);
  if (!isPdf(bytes)) return json({ message: "The uploaded file is not a valid PDF." }, 415);
  const contentHash = await sha256Bytes(buffer), existing = await env.CYPHER.prepare(
    "SELECT id,status,original_filename,uploaded_at FROM documents WHERE tenant_id=? AND content_sha256=?"
  ).bind(session.tenant_id, contentHash).first();
  if (existing) return json({ duplicate: true, document: existing, message: "This exact PDF is already preserved in Cypher." }, 409);
  const documentId = crypto.randomUUID(), jobId = crypto.randomUUID(), artifactId = crypto.randomUUID();
  const filename = safeFilename(request.headers.get("x-cypher-filename") || "document.pdf");
  const documentType = clean(request.headers.get("x-cypher-document-type") || "other", 30).toLowerCase();
  if (!["invoice", "purchase_order", "receipt", "other"].includes(documentType)) return json({ message: "Unknown document type." }, 400);
  const prefix = documentObjectPrefix(session, documentId), objectKey = `${prefix}/original.pdf`;
  const checksum = await sha256Digest(buffer);
  await env.CYPHER_FILES.put(objectKey, buffer, { httpMetadata: { contentType: "application/pdf" }, sha256: checksum,
    customMetadata: { tenant: session.tenant_slug, documentId, originalFilename: filename, uploadedBy: session.user_id } });
  try {
    await env.CYPHER.batch([
      env.CYPHER.prepare(`INSERT INTO documents(id,tenant_id,document_type,status,original_filename,content_sha256,content_type,size_bytes,uploaded_by)
        VALUES(?,?,?,'queued',?,?,'application/pdf',?,?)`).bind(documentId, session.tenant_id, documentType, filename, contentHash, buffer.byteLength, session.user_id),
      env.CYPHER.prepare(`INSERT INTO document_artifacts(id,tenant_id,document_id,artifact_type,object_key,content_sha256,content_type,size_bytes,created_by)
        VALUES(?,?,?,'original',?,?,'application/pdf',?,?)`).bind(artifactId, session.tenant_id, documentId, objectKey, contentHash, buffer.byteLength, session.user_id),
      env.CYPHER.prepare("INSERT INTO processing_jobs(id,tenant_id,document_id,job_type,status) VALUES(?,?,?,'extract','queued')").bind(jobId, session.tenant_id, documentId),
    ]);
  } catch (error) {
    await env.CYPHER_FILES.delete(objectKey);
    throw error;
  }
  try {
    await env.CYPHER_JOBS.send({ schema: "cypher-job/v1", jobId, tenantId: session.tenant_id, documentId, objectKey, contentHash });
  } catch (error) {
    await env.CYPHER.batch([
      env.CYPHER.prepare("UPDATE processing_jobs SET status='failed',last_error_code='QUEUE_SEND_FAILED',last_error_message=?,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(clean(error?.message || "The processing queue did not accept the job.", 500), jobId, session.tenant_id),
      env.CYPHER.prepare("UPDATE documents SET status='needs_review',updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(documentId, session.tenant_id),
    ]);
    await auditTenant(env, session, "document_queue_failed", { job_id: jobId }, documentId);
    return json({ message: "The document was preserved, but processing could not be queued. It can be retried safely.", recoverable: true, document: { id: documentId, status: "needs_review" }, job: { id: jobId, status: "failed" } }, 503);
  }
  await auditTenant(env, session, "document_uploaded", { filename, size_bytes: buffer.byteLength, content_sha256: contentHash }, documentId);
  return json({ document: { id: documentId, status: "queued", original_filename: filename, content_sha256: contentHash }, job: { id: jobId, status: "queued" } }, 202);
}
async function listCypherDocuments(request, env) {
  const session = await authorizedSession(request, env);
  if (!session) return json({ message: "Unauthorized." }, 401);
  const url = new URL(request.url), status = clean(url.searchParams.get("status"), 30), query = clean(url.searchParams.get("q"), 100);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  let sql = `SELECT d.id,d.document_type,d.status,d.original_filename,d.invoice_number,d.po_number,d.document_date,
    d.invoice_total_minor,d.po_total_minor,d.currency,d.match_status,d.difference_minor,d.extraction_confidence,d.uploaded_at,
    s.store_number,v.legal_name AS vendor_legal_name,v.dba_name AS vendor_dba,
    j.status AS job_status,j.last_error_code
    FROM documents d LEFT JOIN stores s ON s.id=d.store_id LEFT JOIN vendors v ON v.id=d.vendor_id
    LEFT JOIN processing_jobs j ON j.document_id=d.id AND j.job_type='extract' WHERE d.tenant_id=?`;
  const binds = [session.tenant_id];
  if (status) { sql += " AND d.status=?"; binds.push(status); }
  if (query) { sql += " AND (d.original_filename LIKE ? OR d.invoice_number LIKE ? OR d.po_number LIKE ? OR s.store_number LIKE ?)"; const like = `%${query}%`; binds.push(like, like, like, like); }
  sql += " ORDER BY d.uploaded_at DESC LIMIT ?"; binds.push(limit);
  const result = await env.CYPHER.prepare(sql).bind(...binds).all();
  return json({ documents: result.results || [] });
}
async function getCypherDocument(request, env, documentId) {
  const session = await authorizedSession(request, env);
  if (!session) return json({ message: "Unauthorized." }, 401);
  const document = await env.CYPHER.prepare(`SELECT d.*,s.store_number,v.legal_name AS vendor_legal_name,v.dba_name AS vendor_dba
    FROM documents d LEFT JOIN stores s ON s.id=d.store_id LEFT JOIN vendors v ON v.id=d.vendor_id WHERE d.id=? AND d.tenant_id=?`)
    .bind(documentId, session.tenant_id).first();
  if (!document) return json({ message: "Document not found." }, 404);
  const [fields, lineItems, relationships, validations, jobs, exposure, artifacts] = await Promise.all([
    env.CYPHER.prepare("SELECT field_key,field_label,extracted_value,confirmed_value,confidence,source_provider,is_required,confirmed_at FROM document_fields WHERE tenant_id=? AND document_id=? ORDER BY is_required DESC,field_label").bind(session.tenant_id, documentId).all(),
    env.CYPHER.prepare("SELECT line_index,part_number,quantity,description,po_line_price_minor,invoice_line_price_minor,variance_minor,match_status FROM document_line_items WHERE tenant_id=? AND document_id=? ORDER BY line_index").bind(session.tenant_id, documentId).all(),
    env.CYPHER.prepare("SELECT relationship_type,explanation,status,related_document_id,created_at FROM document_relationships WHERE tenant_id=? AND source_document_id=? ORDER BY created_at DESC").bind(session.tenant_id, documentId).all(),
    env.CYPHER.prepare("SELECT decision,notes,validator_user_id,validated_at FROM validations WHERE tenant_id=? AND document_id=? ORDER BY validated_at DESC").bind(session.tenant_id, documentId).all(),
    env.CYPHER.prepare("SELECT job_type,status,provider,attempt_count,last_error_code,last_error_message,updated_at FROM processing_jobs WHERE tenant_id=? AND document_id=?").bind(session.tenant_id, documentId).all(),
    env.CYPHER.prepare("SELECT classification,amount_minor,due_at,resolution_required,updated_at FROM document_exposure WHERE tenant_id=? AND document_id=?").bind(session.tenant_id, documentId).first(),
    env.CYPHER.prepare("SELECT artifact_type,version,created_at FROM document_artifacts WHERE tenant_id=? AND document_id=? ORDER BY artifact_type,version DESC").bind(session.tenant_id, documentId).all(),
  ]);
  return json({ document, fields: fields.results || [], line_items: lineItems.results || [], relationships: relationships.results || [], validations: validations.results || [], jobs: jobs.results || [], exposure: exposure || null, artifacts: artifacts.results || [] });
}
async function downloadCypherOriginal(request, env, documentId) {
  const session = await authorizedSession(request, env);
  if (!session) return json({ message: "Unauthorized." }, 401);
  const artifact = await env.CYPHER.prepare(`SELECT a.object_key,d.original_filename FROM document_artifacts a JOIN documents d ON d.id=a.document_id
    WHERE a.tenant_id=? AND a.document_id=? AND a.artifact_type='original' ORDER BY a.version DESC LIMIT 1`).bind(session.tenant_id, documentId).first();
  if (!artifact) return json({ message: "Original PDF not found." }, 404);
  const object = await env.CYPHER_FILES.get(artifact.object_key);
  if (!object) return json({ message: "Original PDF is unavailable. Support has been notified." }, 503);
  return new Response(object.body, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${safeFilename(artifact.original_filename)}"`,
    "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox" } });
}
async function downloadCypherArtifact(request, env, documentId, artifactType) {
  const session = await authorizedSession(request, env); if (!session) return json({ message: "Unauthorized." }, 401);
  if (!["validation_pdf", "evidence_manifest"].includes(artifactType)) return json({ message: "Unknown artifact." }, 404);
  const artifact = await env.CYPHER.prepare("SELECT object_key,content_type FROM document_artifacts WHERE tenant_id=? AND document_id=? AND artifact_type=? ORDER BY version DESC LIMIT 1").bind(session.tenant_id, documentId, artifactType).first();
  if (!artifact) return json({ message: "Artifact not found." }, 404);
  const object = await env.CYPHER_FILES.get(artifact.object_key); if (!object) return json({ message: "Artifact unavailable." }, 503);
  const extension = artifactType === "validation_pdf" ? "pdf" : "json";
  return new Response(object.body, { headers: { "content-type": artifact.content_type, "content-disposition": `attachment; filename="cypher-${documentId}-${artifactType}.${extension}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
function pdfText(value, max = 90) { const normalized = String(value ?? "").replace(/[^\x20-\x7E]/g, " ").trim(); return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized || "-"; }
async function createValidationArtifacts(env, session, document, validationId, decision, notes) {
  const [tenant, fieldsResult, linesResult, relationshipsResult, original] = await Promise.all([
    env.CYPHER.prepare("SELECT display_name,slug FROM tenants WHERE id=?").bind(session.tenant_id).first(),
    env.CYPHER.prepare("SELECT field_label,field_key,COALESCE(confirmed_value,extracted_value) AS value,confidence,source_provider FROM document_fields WHERE tenant_id=? AND document_id=? ORDER BY is_required DESC,field_label").bind(session.tenant_id, document.id).all(),
    env.CYPHER.prepare("SELECT line_index,part_number,quantity,description,po_line_price_minor,invoice_line_price_minor,variance_minor,match_status FROM document_line_items WHERE tenant_id=? AND document_id=? ORDER BY line_index").bind(session.tenant_id, document.id).all(),
    env.CYPHER.prepare("SELECT relationship_type,explanation,status FROM document_relationships WHERE tenant_id=? AND source_document_id=? ORDER BY created_at").bind(session.tenant_id, document.id).all(),
    env.CYPHER.prepare("SELECT object_key,content_sha256 FROM document_artifacts WHERE tenant_id=? AND document_id=? AND artifact_type='original' ORDER BY version DESC LIMIT 1").bind(session.tenant_id, document.id).first(),
  ]);
  const fields = fieldsResult.results || [], lines = linesResult.results || [], relationships = relationshipsResult.results || [];
  const pdf = await PDFDocument.create(); const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]), y = 744;
  const ink = rgb(0.05, 0.08, 0.12), blue = rgb(0.05, 0.48, 0.95), gray = rgb(0.38, 0.43, 0.5);
  const line = (label, value) => { if (y < 72) { page = pdf.addPage([612, 792]); y = 744; } page.drawText(pdfText(label, 34), { x: 44, y, size: 9, font: bold, color: gray }); page.drawText(pdfText(value, 72), { x: 190, y, size: 9, font: regular, color: ink }); y -= 17; };
  page.drawText("CYPHER", { x: 44, y, size: 12, font: bold, color: blue }); y -= 30;
  page.drawText("Document Validation Record", { x: 44, y, size: 22, font: bold, color: ink }); y -= 22;
  page.drawText("Human-confirmed evidence generated by Cypher Online", { x: 44, y, size: 10, font: regular, color: gray }); y -= 30;
  line("Organization", tenant?.display_name); line("Document ID", document.id); line("Original file", document.original_filename); line("Original SHA-256", original?.content_sha256); line("Decision", decision); line("Validated by", `${session.display_name} (${session.email})`); line("Validation time", new Date().toISOString()); line("Notes", notes || "No notes provided");
  y -= 12; page.drawText("Confirmed fields", { x: 44, y, size: 14, font: bold, color: ink }); y -= 22;
  for (const field of fields) line(field.field_label || field.field_key, field.value);
  if (lines.length) { y -= 8; page.drawText("Line-item comparison", { x: 44, y, size: 14, font: bold, color: ink }); y -= 22; for (const item of lines) line(`Line ${Number(item.line_index) + 1}`, `${item.part_number || "No part"} | ${item.quantity || "-"} | ${item.match_status} | variance ${item.variance_minor == null ? "-" : item.variance_minor}`); }
  if (relationships.length) { y -= 8; page.drawText("Document relationships", { x: 44, y, size: 14, font: bold, color: ink }); y -= 22; for (const relationship of relationships) line(relationship.relationship_type, relationship.explanation); }
  page.drawText("Cypher preserves model output as candidate evidence. This record reflects the named user's validation decision.", { x: 44, y: 36, size: 7, font: regular, color: gray });
  const pdfBytes = await pdf.save(), pdfHash = await sha256Bytes(pdfBytes);
  const versions = await env.CYPHER.prepare("SELECT artifact_type,COALESCE(MAX(version),0)+1 AS next_version FROM document_artifacts WHERE tenant_id=? AND document_id=? AND artifact_type IN ('validation_pdf','evidence_manifest') GROUP BY artifact_type").bind(session.tenant_id, document.id).all();
  const nextVersion = Object.fromEntries((versions.results || []).map((row) => [row.artifact_type, Number(row.next_version)]));
  const pdfVersion = nextVersion.validation_pdf || 1, manifestVersion = nextVersion.evidence_manifest || 1;
  const prefix = original.object_key.replace(/\/original\.pdf$/, ""), versionedPdfKey = pdfVersion === 1 ? `${prefix}/validation.pdf` : `${prefix}/validation-v${pdfVersion}.pdf`, versionedManifestKey = manifestVersion === 1 ? `${prefix}/evidence-manifest.json` : `${prefix}/evidence-manifest-v${manifestVersion}.json`;
  await env.CYPHER_FILES.put(versionedPdfKey, pdfBytes, { httpMetadata: { contentType: "application/pdf" }, sha256: await sha256Digest(pdfBytes) });
  const manifest = { schema: "cypher-evidence-manifest/v1", tenant: tenant?.slug, document_id: document.id, validation_id: validationId, decision, validated_by: { user_id: session.user_id, display_name: session.display_name, email: session.email }, validated_at: new Date().toISOString(), original: { object_key: original.object_key, sha256: original.content_sha256 }, validation_pdf: { object_key: versionedPdfKey, sha256: pdfHash }, fields: fields.map((field) => ({ key: field.field_key, value: field.value, confidence: field.confidence, source_provider: field.source_provider })), line_items: lines, relationships };
  const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2)), manifestHash = await sha256Bytes(manifestBytes);
  await env.CYPHER_FILES.put(versionedManifestKey, manifestBytes, { httpMetadata: { contentType: "application/json" }, sha256: await sha256Digest(manifestBytes) });
  await env.CYPHER.batch([
    env.CYPHER.prepare("INSERT INTO document_artifacts(id,tenant_id,document_id,artifact_type,object_key,content_sha256,content_type,size_bytes,version,created_by) VALUES(?,?,?,'validation_pdf',?,?,'application/pdf',?,?,?)").bind(crypto.randomUUID(), session.tenant_id, document.id, versionedPdfKey, pdfHash, pdfBytes.byteLength, pdfVersion, session.user_id),
    env.CYPHER.prepare("INSERT INTO document_artifacts(id,tenant_id,document_id,artifact_type,object_key,content_sha256,content_type,size_bytes,version,created_by) VALUES(?,?,?,'evidence_manifest',?,?,'application/json',?,?,?)").bind(crypto.randomUUID(), session.tenant_id, document.id, versionedManifestKey, manifestHash, manifestBytes.byteLength, manifestVersion, session.user_id),
    env.CYPHER.prepare("UPDATE validations SET validation_pdf_hash=?,evidence_manifest_hash=? WHERE id=? AND tenant_id=?").bind(pdfHash, manifestHash, validationId, session.tenant_id),
  ]);
  return { pdf_hash: pdfHash, manifest_hash: manifestHash };
}
async function validateCypherDocument(request, env, documentId) {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  const session = await authorizedSession(request, env, REVIEW_ROLES);
  if (!session) return json({ message: "Validation access required." }, 403);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid validation request." }, 400); }
  const decisions = new Set(["approved", "approved_with_variance", "unmatched", "rejected", "needs_resolution"]), decision = clean(body.decision, 40);
  if (!decisions.has(decision)) return json({ message: "Unknown validation decision." }, 400);
  const document = await env.CYPHER.prepare("SELECT * FROM documents WHERE id=? AND tenant_id=?").bind(documentId, session.tenant_id).first();
  if (!document) return json({ message: "Document not found." }, 404);
  const fields = body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? body.fields : {};
  const required = ["po_number", "invoice_number", "store_number", "invoice_date", "po_total", "invoice_total", "match_status", "extraction_confidence", "salesperson", "vendor_id"];
  if (["approved", "approved_with_variance"].includes(decision) && required.some((key) => !String(fields[key] ?? "").trim())) return json({ message: "All required approval fields must be confirmed." }, 400);
  const statements = [];
  for (const [key, value] of Object.entries(fields).slice(0, 50)) {
    const fieldKey = clean(key, 80), confirmed = clean(value, 1000); if (!fieldKey) continue;
    statements.push(env.CYPHER.prepare(`INSERT INTO document_fields(id,tenant_id,document_id,field_key,field_label,confirmed_value,confirmed_by,confirmed_at)
      VALUES(?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(tenant_id,document_id,field_key) DO UPDATE SET confirmed_value=excluded.confirmed_value,
      confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at`).bind(crypto.randomUUID(), session.tenant_id, documentId, fieldKey, fieldKey.replace(/_/g, " "), confirmed, session.user_id));
  }
  if (statements.length) await env.CYPHER.batch(statements);
  const confirmedInvoice = clean(fields.invoice_number, 160) || document.invoice_number, confirmedPo = clean(fields.po_number, 160) || document.po_number;
  const confirmedInvoiceTotal = fields.invoice_total == null ? document.invoice_total_minor : minorUnits(fields.invoice_total), confirmedPoTotal = fields.po_total == null ? document.po_total_minor : minorUnits(fields.po_total);
  const confirmedDifference = confirmedInvoiceTotal !== null && confirmedPoTotal !== null ? confirmedInvoiceTotal - confirmedPoTotal : document.difference_minor;
  await env.CYPHER.prepare("UPDATE documents SET invoice_number=?,po_number=?,document_date=COALESCE(?,document_date),invoice_total_minor=?,po_total_minor=?,difference_minor=?,extraction_confidence=COALESCE(?,extraction_confidence),updated_at=datetime('now') WHERE id=? AND tenant_id=?")
    .bind(confirmedInvoice, confirmedPo, clean(fields.invoice_date, 40) || null, confirmedInvoiceTotal, confirmedPoTotal, confirmedDifference, Number.isFinite(Number(fields.extraction_confidence)) ? Number(fields.extraction_confidence) : null, documentId, session.tenant_id).run();
  if (clean(fields.store_number, 40)) {
    const storeNumber = clean(fields.store_number, 40); await env.CYPHER.prepare("INSERT INTO stores(id,tenant_id,store_number) VALUES(?,?,?) ON CONFLICT(tenant_id,store_number) DO NOTHING").bind(crypto.randomUUID(), session.tenant_id, storeNumber).run();
    await env.CYPHER.prepare("UPDATE documents SET store_id=(SELECT id FROM stores WHERE tenant_id=? AND store_number=?) WHERE id=? AND tenant_id=?").bind(session.tenant_id, storeNumber, documentId, session.tenant_id).run();
    await relocateDocumentArtifacts(env, session.tenant_id, documentId, storeNumber, clean(fields.invoice_date, 40) || document.document_date);
  }
  const validationId = crypto.randomUUID(), targetStatus = decision === "unmatched" ? "unmatched" : decision === "rejected" ? "rejected" : decision === "needs_resolution" ? "needs_review" : "validated";
  await env.CYPHER.batch([
    env.CYPHER.prepare("INSERT INTO validations(id,tenant_id,document_id,decision,notes,validator_user_id) VALUES(?,?,?,?,?,?)").bind(validationId, session.tenant_id, documentId, decision, clean(body.notes, 2000) || null, session.user_id),
    env.CYPHER.prepare("UPDATE documents SET status=?,match_status=?,validated_by=?,validated_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND tenant_id=?")
      .bind(targetStatus, decision === "unmatched" ? "unmatched" : decision === "approved_with_variance" ? "variance" : decision === "approved" ? "matched" : document.match_status, session.user_id, documentId, session.tenant_id),
  ]);
  const amountMinor = Math.max(0, Number(confirmedInvoiceTotal || 0));
  const settings = await env.CYPHER.prepare("SELECT resolution_required_days FROM tenant_settings WHERE tenant_id=?").bind(session.tenant_id).first();
  const days = Number(settings?.resolution_required_days || 90), anchor = document.document_date || document.uploaded_at;
  const due = new Date(anchor); due.setUTCDate(due.getUTCDate() + days); const dueAt = Number.isNaN(due.getTime()) ? null : due.toISOString().slice(0, 10);
  const classification = targetStatus === "validated" ? "cleared" : decision === "unmatched" ? "unmatched" : decision === "rejected" ? "cleared" : "disputed";
  await env.CYPHER.prepare(`INSERT INTO document_exposure(tenant_id,document_id,classification,amount_minor,due_at,resolution_required,updated_by)
    VALUES(?,?,?,?,?,CASE WHEN ? IS NOT NULL AND date(?)<=date('now') THEN 1 ELSE 0 END,?)
    ON CONFLICT(document_id) DO UPDATE SET classification=excluded.classification,amount_minor=excluded.amount_minor,due_at=excluded.due_at,resolution_required=excluded.resolution_required,updated_by=excluded.updated_by,updated_at=datetime('now')`)
    .bind(session.tenant_id, documentId, classification, amountMinor, dueAt, dueAt, dueAt, session.user_id).run();
  const evidence = await createValidationArtifacts(env, session, { ...document, id: documentId }, validationId, decision, clean(body.notes, 2000));
  await auditTenant(env, session, "document_validated", { decision, validation_id: validationId }, documentId);
  return json({ ok: true, validation_id: validationId, status: targetStatus, evidence });
}
async function reprocessCypherDocument(request, env, documentId) {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  const session = await authorizedSession(request, env, REVIEW_ROLES);
  if (!session) return json({ message: "Review access required." }, 403);
  const document = await env.CYPHER.prepare("SELECT id,status,content_sha256 FROM documents WHERE id=? AND tenant_id=?").bind(documentId, session.tenant_id).first();
  if (!document) return json({ message: "Document not found." }, 404);
  if (["validated", "rejected"].includes(document.status)) return json({ message: "Validated or rejected documents cannot be reprocessed." }, 409);
  const artifact = await env.CYPHER.prepare("SELECT object_key,content_sha256 FROM document_artifacts WHERE tenant_id=? AND document_id=? AND artifact_type='original' ORDER BY version DESC LIMIT 1").bind(session.tenant_id, documentId).first();
  if (!artifact) return json({ message: "The original document artifact is unavailable." }, 409);
  let job = await env.CYPHER.prepare("SELECT id FROM processing_jobs WHERE tenant_id=? AND document_id=? AND job_type='extract' ORDER BY queued_at DESC LIMIT 1").bind(session.tenant_id, documentId).first();
  const jobId = job?.id || crypto.randomUUID();
  if (job) {
    await env.CYPHER.prepare("UPDATE processing_jobs SET status='queued',provider=NULL,attempt_count=0,started_at=NULL,completed_at=NULL,last_error_code=NULL,last_error_message=NULL,updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(jobId, session.tenant_id).run();
  } else {
    await env.CYPHER.prepare("INSERT INTO processing_jobs(id,tenant_id,document_id,job_type,status) VALUES(?,?,?,'extract','queued')").bind(jobId, session.tenant_id, documentId).run();
  }
  await env.CYPHER.prepare("UPDATE documents SET status='queued',updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(documentId, session.tenant_id).run();
  try {
    await env.CYPHER_JOBS.send({ schema: "cypher-job/v1", jobId, tenantId: session.tenant_id, documentId, objectKey: artifact.object_key, contentHash: artifact.content_sha256 || document.content_sha256 });
  } catch (error) {
    await env.CYPHER.batch([
      env.CYPHER.prepare("UPDATE processing_jobs SET status='failed',last_error_code='QUEUE_SEND_FAILED',last_error_message=?,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(clean(error?.message || "The processing queue did not accept the job.", 500), jobId, session.tenant_id),
      env.CYPHER.prepare("UPDATE documents SET status='needs_review',updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(documentId, session.tenant_id),
    ]);
    await auditTenant(env, session, "document_reprocessing_queue_failed", { job_id: jobId }, documentId);
    return json({ message: "The document remains preserved, but reprocessing could not be queued. It can be retried safely.", recoverable: true, document_id: documentId, job_id: jobId }, 503);
  }
  await auditTenant(env, session, "document_reprocessing_requested", { job_id: jobId }, documentId);
  return json({ ok: true, document_id: documentId, job_id: jobId, status: "queued" }, 202);
}
async function listCypherStores(request, env) {
  const session = await authorizedSession(request, env); if (!session) return json({ message: "Unauthorized." }, 401);
  const result = await env.CYPHER.prepare(`SELECT s.id,s.store_number,s.display_name,s.region,s.status,
    COUNT(d.id) AS document_count,
    SUM(CASE WHEN d.status='unmatched' THEN 1 ELSE 0 END) AS unmatched_count,
    COALESCE(SUM(CASE WHEN e.classification IN ('confirmed_outstanding','overdue') THEN e.amount_minor ELSE 0 END),0) AS outstanding_minor
    FROM stores s LEFT JOIN documents d ON d.store_id=s.id AND d.tenant_id=s.tenant_id
    LEFT JOIN document_exposure e ON e.document_id=d.id AND e.tenant_id=s.tenant_id
    WHERE s.tenant_id=? GROUP BY s.id ORDER BY CAST(s.store_number AS INTEGER),s.store_number`).bind(session.tenant_id).all();
  return json({ stores: result.results || [], currency: "USD" });
}
async function listCypherVendors(request, env) {
  const session = await authorizedSession(request, env); if (!session) return json({ message: "Unauthorized." }, 401);
  const result = await env.CYPHER.prepare(`SELECT v.id,v.legal_name,v.dba_name,v.vendor_number,v.aliases,v.service_categories,v.service_areas,v.status,
    COUNT(d.id) AS document_count,
    COALESCE(SUM(CASE WHEN e.classification IN ('confirmed_outstanding','overdue') THEN e.amount_minor ELSE 0 END),0) AS outstanding_minor
    FROM vendors v LEFT JOIN documents d ON d.vendor_id=v.id AND d.tenant_id=v.tenant_id
    LEFT JOIN document_exposure e ON e.document_id=d.id AND e.tenant_id=v.tenant_id
    WHERE v.tenant_id=? GROUP BY v.id ORDER BY v.legal_name`).bind(session.tenant_id).all();
  return json({ vendors: result.results || [], currency: "USD" });
}
async function listCypherExposure(request, env) {
  const session = await authorizedSession(request, env); if (!session) return json({ message: "Unauthorized." }, 401);
  const result = await env.CYPHER.prepare(`SELECT e.document_id,e.classification,e.amount_minor,e.due_at,e.resolution_required,e.updated_at,
    d.invoice_number,d.po_number,d.document_date,d.currency,s.store_number,v.legal_name AS vendor_legal_name,v.dba_name AS vendor_dba
    FROM document_exposure e JOIN documents d ON d.id=e.document_id AND d.tenant_id=e.tenant_id
    LEFT JOIN stores s ON s.id=d.store_id LEFT JOIN vendors v ON v.id=d.vendor_id
    WHERE e.tenant_id=? AND e.classification<>'cleared' ORDER BY CASE e.classification WHEN 'overdue' THEN 0 WHEN 'confirmed_outstanding' THEN 1 ELSE 2 END,e.due_at`).bind(session.tenant_id).all();
  return json({ exposure: result.results || [] });
}

async function getPlatformReadiness(request, env) {
  const admin = await currentPlatformAdmin(request, env, ["platform_owner", "operations_admin", "security_auditor"]);
  if (!admin) return json({ message: "Platform administrator access required." }, 403);
  const providers = (await env.CYPHER.prepare("SELECT provider_code,enabled,readiness,last_checked_at,last_error_code FROM provider_runtime_state ORDER BY provider_code").all()).results || [];
  return json({ readiness: {
    database_bound: Boolean(env.CYPHER), object_storage_bound: Boolean(env.CYPHER_FILES), queue_bound: Boolean(env.CYPHER_JOBS),
    owner_email_configured: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(env.PLATFORM_OWNER_EMAIL || "")),
    openai_secret_present: Boolean(env.OPENAI_API_KEY), azure_secret_present: Boolean(env.AZURE_DOCUMENT_INTELLIGENCE_KEY && env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT),
    supabase_enabled: env.CYPHER_SUPABASE_ENABLED === "true", supabase_configured: Boolean(env.SUPABASE_URL && (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY)),
  }, providers });
}
async function checkSupabaseReadiness(request, env) {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  const admin = await currentPlatformAdmin(request, env, ["platform_owner"]); if (!admin) return json({ message: "Platform Owner access required." }, 403);
  if (env.CYPHER_SUPABASE_ENABLED !== "true") return json({ ready: false, state: "disabled", message: "Supabase is intentionally disabled until final go-live confirmation." });
  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, ""), key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!/^https:\/\/[^/]+$/.test(base) || !key) return json({ ready: false, state: "not_configured", message: "Supabase URL or backend secret is missing." }, 503);
  let readiness = "degraded", errorCode = null;
  try {
    const response = await fetch(`${base}/rest/v1/`, { method: "HEAD", headers: { apikey: key, "user-agent": "cypher-cloudflare-worker/1.0" }, signal: AbortSignal.timeout(10000) });
    readiness = response.status < 500 && response.status !== 401 && response.status !== 403 ? "ready" : "degraded"; errorCode = readiness === "ready" ? null : `SUPABASE_HTTP_${response.status}`;
  } catch (error) { errorCode = clean(error?.name || "SUPABASE_CONNECTION_FAILED", 80); }
  await env.CYPHER.prepare("UPDATE provider_runtime_state SET enabled=1,readiness=?,last_checked_at=datetime('now'),last_error_code=?,updated_at=datetime('now') WHERE provider_code='supabase'").bind(readiness, errorCode).run();
  await env.CYPHER.prepare("INSERT INTO platform_admin_audit(id,admin_id,event_type,target_type,details) VALUES(?,?, 'supabase_connection_checked','provider',?)").bind(crypto.randomUUID(), admin.id, JSON.stringify({ readiness, error_code: errorCode })).run();
  return json({ ready: readiness === "ready", state: readiness, error_code: errorCode }, readiness === "ready" ? 200 : 503);
}

const EXTRACTION_KEYS = ["document_type","po_number","invoice_number","store_number","invoice_date","invoice_time","po_date","supplier_legal_name","supplier_dba","customer","department","account_id","invoice_total","po_total","tax_total","currency","match_status","difference_amount","extraction_confidence","salesperson","vendor_id","register","ship_to_address","bill_to_address","warranty_information","vehicle_year_make_model","vin","license_plate","mileage","government_property_number","signatures_present","handwriting_detected","orientation_correction_applied"];
function extractionSchema(customFields = []) {
  const properties = Object.fromEntries(EXTRACTION_KEYS.map((key) => [key, key === "extraction_confidence" ? { type: ["number","null"], minimum: 0, maximum: 1 } : key.endsWith("_present") || key.endsWith("_detected") || key.endsWith("_applied") ? { type: ["boolean","null"] } : { type: ["string","null"] }]));
  for (const field of customFields) properties[field.field_key] = { type: ["string", "null"] };
  properties.line_items = { type: "array", items: { type: "object", properties: { part_number: { type: ["string","null"] }, quantity: { type: ["string","null"] }, description: { type: ["string","null"] }, po_line_price: { type: ["string","null"] }, invoice_line_price: { type: ["string","null"] } }, required: ["part_number","quantity","description","po_line_price","invoice_line_price"], additionalProperties: false } };
  return { type: "object", properties, required: [...EXTRACTION_KEYS, ...customFields.map((field) => field.field_key), "line_items"], additionalProperties: false };
}
function responseOutputText(payload) {
  for (const item of payload?.output || []) for (const content of item?.content || []) if (content.type === "output_text" && content.text) return content.text;
  return "";
}
async function extractWithOpenAI(env, object, filename, tenantId) {
  const bytes = new Uint8Array(await object.arrayBuffer()), fileData = `data:application/pdf;base64,${bytesToBase64(bytes)}`;
  const customFields = (await env.CYPHER.prepare("SELECT field_key,field_label,category,is_required FROM tenant_field_definitions WHERE tenant_id=? AND active=1 ORDER BY field_label LIMIT 30").bind(tenantId).all()).results || [];
  const models = [...new Set([env.CYPHER_OPENAI_MODEL || "gpt-5.6-terra", env.CYPHER_OPENAI_FALLBACK_MODEL || "gpt-5.6-sol"])]; let lastError;
  for (const model of models) {
    const apiKey = String(env.OPENAI_API_KEY || "").replace(/^\uFEFF+|\uFEFF+$/g, "").trim();
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, signal: AbortSignal.timeout(60000), body: JSON.stringify({
      model, store: false, reasoning: { effort: "medium" }, safety_identifier: await sha256(`cypher:${tenantId}`),
      input: [{ role: "user", content: [{ type: "input_file", filename, file_data: fileData, detail: "high" }, { type: "input_text", text: `Extract invoice and purchase-order evidence exactly as visible. Never infer an unreadable identifier. Use null for missing or uncertain values. Return monetary values as printed strings. Detect signatures, handwriting, and orientation correction. A repeated PO may be legitimate; do not label duplication without invoice evidence.${customFields.length ? ` Also extract these tenant-defined fields when visible: ${customFields.map((field) => `${field.field_label} (${field.field_key})`).join(", ")}.` : ""}` }] }],
      text: { format: { type: "json_schema", name: "cypher_document_extraction", strict: true, schema: extractionSchema(customFields) } },
    }) });
    const payload = await response.json();
    if (!response.ok) { lastError = Object.assign(new Error(payload?.error?.message || `OpenAI returned HTTP ${response.status}`), { code: payload?.error?.code || `OPENAI_HTTP_${response.status}` }); continue; }
    const output = responseOutputText(payload); if (!output) { lastError = Object.assign(new Error("OpenAI returned no structured extraction."), { code: "OPENAI_EMPTY_OUTPUT" }); continue; }
    return { data: JSON.parse(output), provider: "openai_vision", model, responseId: payload.id || null };
  }
  throw lastError || Object.assign(new Error("OpenAI extraction failed."), { code: "OPENAI_EXTRACTION_FAILED" });
}
function azureFieldValue(field) {
  if (!field) return null;
  for (const key of ["valueString","valueDate","valueTime","valueNumber","valueInteger","valueCurrency","valuePhoneNumber","content"]) if (field[key] !== undefined && field[key] !== null) {
    const value = field[key]; return typeof value === "object" && value.amount !== undefined ? `${value.currencyCode || ""} ${value.amount}`.trim() : String(value);
  }
  return null;
}
async function extractWithAzure(env, object) {
  const endpoint = String(env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || "").replace(/^\uFEFF+|\uFEFF+$/g, "").trim().replace(/\/+$/, ""), apiVersion = "2024-11-30";
  const azureKey = String(env.AZURE_DOCUMENT_INTELLIGENCE_KEY || "").replace(/^\uFEFF+|\uFEFF+$/g, "").trim();
  let endpointOrigin;
  try { endpointOrigin = new URL(endpoint).origin; } catch { throw Object.assign(new Error("Azure Document Intelligence endpoint is invalid."), { code: "AZURE_ENDPOINT_INVALID" }); }
  if (!endpointOrigin.startsWith("https://")) throw Object.assign(new Error("Azure Document Intelligence requires HTTPS."), { code: "AZURE_ENDPOINT_INSECURE" });
  const start = await fetch(`${endpoint}/documentintelligence/documentModels/prebuilt-invoice:analyze?_overload=analyzeDocument&api-version=${apiVersion}`, { method: "POST", headers: { "ocp-apim-subscription-key": azureKey, "content-type": "application/pdf" }, signal: AbortSignal.timeout(30000), body: object.body });
  if (start.status !== 202) { const error = new Error(`Azure Document Intelligence returned HTTP ${start.status}`); error.code = `AZURE_HTTP_${start.status}`; throw error; }
  const operation = start.headers.get("operation-location"); if (!operation) throw Object.assign(new Error("Azure did not return an operation location."), { code: "AZURE_OPERATION_MISSING" });
  let operationUrl;
  try { operationUrl = new URL(operation); } catch { throw Object.assign(new Error("Azure returned an invalid operation location."), { code: "AZURE_OPERATION_INVALID" }); }
  if (operationUrl.origin !== endpointOrigin) throw Object.assign(new Error("Azure returned an operation location outside the configured service."), { code: "AZURE_OPERATION_ORIGIN_MISMATCH" });
  let payload;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(3000, 500 + attempt * 250)));
    const poll = await fetch(operationUrl, { headers: { "ocp-apim-subscription-key": azureKey }, signal: AbortSignal.timeout(10000) }); payload = await poll.json();
    if (!poll.ok) throw Object.assign(new Error(payload?.error?.message || `Azure polling returned HTTP ${poll.status}`), { code: payload?.error?.code || `AZURE_POLL_${poll.status}` });
    if (payload.status === "succeeded") break; if (payload.status === "failed") throw Object.assign(new Error(payload?.error?.message || "Azure analysis failed."), { code: payload?.error?.code || "AZURE_ANALYSIS_FAILED" });
  }
  if (payload?.status !== "succeeded") throw Object.assign(new Error("Azure analysis did not finish before the queue deadline."), { code: "AZURE_ANALYSIS_TIMEOUT" });
  const fields = payload.analyzeResult?.documents?.[0]?.fields || {}, confidenceValues = Object.values(fields).map((field) => Number(field?.confidence)).filter(Number.isFinite);
  const data = Object.fromEntries(EXTRACTION_KEYS.map((key) => [key, null]));
  Object.assign(data, { document_type: "invoice", invoice_number: azureFieldValue(fields.InvoiceId), po_number: azureFieldValue(fields.PurchaseOrder), invoice_date: azureFieldValue(fields.InvoiceDate), supplier_legal_name: azureFieldValue(fields.VendorName), supplier_dba: null, customer: azureFieldValue(fields.CustomerName), account_id: azureFieldValue(fields.CustomerId), invoice_total: azureFieldValue(fields.InvoiceTotal), po_total: azureFieldValue(fields.Total), tax_total: azureFieldValue(fields.TotalTax), currency: fields.InvoiceTotal?.valueCurrency?.currencyCode || null, vendor_id: azureFieldValue(fields.VendorTaxId), bill_to_address: azureFieldValue(fields.BillingAddress), ship_to_address: azureFieldValue(fields.ShippingAddress), extraction_confidence: confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : null, signatures_present: null, handwriting_detected: null, orientation_correction_applied: null });
  data.line_items = (fields.Items?.valueArray || []).map((entry) => { const item = entry.valueObject || {}; return { part_number: azureFieldValue(item.ProductCode), quantity: azureFieldValue(item.Quantity), description: azureFieldValue(item.Description), po_line_price: azureFieldValue(item.UnitPrice), invoice_line_price: azureFieldValue(item.Amount) }; });
  return { data, provider: "azure_document_intelligence", model: "prebuilt-invoice@2024-11-30", responseId: operation.split("/").pop()?.split("?")[0] || null };
}
function minorUnits(value) {
  if (value == null || value === "") return null; const normalized = String(value).replace(/[^0-9.-]/g, ""); const number = Number(normalized); return Number.isFinite(number) ? Math.round(number * 100) : null;
}
function normalizeDocumentType(value) {
  const normalized = clean(value, 80).toLowerCase().replace(/[\s_-]+/g, " ");
  if (normalized.includes("purchase") && normalized.includes("order")) return "purchase_order";
  if (normalized.includes("invoice")) return "invoice";
  if (normalized.includes("receipt")) return "receipt";
  return "other";
}
function normalizePoNumber(value) { return clean(value, 160).replace(/\s*-\s*/g, "-").replace(/\s+/g, " ") || null; }
function normalizeInvoiceNumber(value) {
  const source = clean(value, 160); if (!source) return null;
  const digits = source.replace(/\D/g, "");
  return digits.length >= 10 && /^[\d\s-]+$/.test(source) ? digits : source;
}
async function persistExtraction(env, job, result, objectKey) {
  const runId = crypto.randomUUID(), data = result.data, confidence = Number.isFinite(Number(data.extraction_confidence)) ? Number(data.extraction_confidence) : null;
  data.document_type = normalizeDocumentType(data.document_type);
  data.po_number = normalizePoNumber(data.po_number);
  data.invoice_number = normalizeInvoiceNumber(data.invoice_number);
  const extractionBytes = encoder.encode(JSON.stringify({ schema: "cypher-extraction/v1", provider: result.provider, model: result.model, provider_response_id: result.responseId, extracted_at: new Date().toISOString(), data }));
  const priorExtraction = await env.CYPHER.prepare("SELECT COALESCE(MAX(version),0) AS version FROM document_artifacts WHERE tenant_id=? AND document_id=? AND artifact_type='extraction'").bind(job.tenant_id, job.document_id).first();
  const extractionVersion = Number(priorExtraction?.version || 0) + 1;
  const extractionHash = await sha256Bytes(extractionBytes), extractionKey = objectKey.replace(/original\.pdf$/, extractionVersion === 1 ? "extraction.json" : `extraction-v${extractionVersion}.json`);
  await env.CYPHER_FILES.put(extractionKey, extractionBytes, { httpMetadata: { contentType: "application/json" }, sha256: await sha256Digest(extractionBytes), customMetadata: { tenantId: job.tenant_id, documentId: job.document_id } });
  const customDefinitions = (await env.CYPHER.prepare("SELECT field_key,field_label,is_required FROM tenant_field_definitions WHERE tenant_id=? AND active=1").bind(job.tenant_id).all()).results || [];
  const customByKey = Object.fromEntries(customDefinitions.map((field) => [field.field_key, field]));
  const allFieldKeys = [...EXTRACTION_KEYS, ...customDefinitions.map((field) => field.field_key)];
  const fields = allFieldKeys.map((key) => env.CYPHER.prepare(`INSERT INTO document_fields(id,tenant_id,document_id,field_key,field_label,extracted_value,confidence,source_provider,is_required)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,document_id,field_key) DO UPDATE SET extracted_value=excluded.extracted_value,confidence=excluded.confidence,source_provider=excluded.source_provider`)
    .bind(crypto.randomUUID(), job.tenant_id, job.document_id, key, customByKey[key]?.field_label || key.replace(/_/g, " "), data[key] == null ? null : String(data[key]), confidence, result.provider, customByKey[key]?.is_required || ["po_number","invoice_number","store_number","invoice_date","po_total","invoice_total","match_status","extraction_confidence","salesperson","vendor_id"].includes(key) ? 1 : 0));
  const lineItems = Array.isArray(data.line_items) ? data.line_items.slice(0, 250) : [];
  const lineStatements = lineItems.map((item, index) => {
    const po = minorUnits(item.po_line_price), invoice = minorUnits(item.invoice_line_price), variance = po !== null && invoice !== null ? invoice - po : null;
    const status = variance === null ? "incomplete" : variance === 0 ? "matched" : "variance";
    return env.CYPHER.prepare(`INSERT INTO document_line_items(id,tenant_id,document_id,line_index,part_number,quantity,description,po_line_price_minor,invoice_line_price_minor,variance_minor,match_status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,document_id,line_index) DO UPDATE SET part_number=excluded.part_number,quantity=excluded.quantity,description=excluded.description,po_line_price_minor=excluded.po_line_price_minor,invoice_line_price_minor=excluded.invoice_line_price_minor,variance_minor=excluded.variance_minor,match_status=excluded.match_status,updated_at=datetime('now')`)
      .bind(crypto.randomUUID(), job.tenant_id, job.document_id, index, clean(item.part_number, 160) || null, clean(item.quantity, 80) || null, clean(item.description, 500) || null, po, invoice, variance, status);
  });
  const artifactId = crypto.randomUUID();
  await env.CYPHER.batch([
    env.CYPHER.prepare(`INSERT INTO extraction_runs(id,tenant_id,document_id,job_id,provider,provider_model,status,confidence,raw_response_object_key,orientation_corrected,handwriting_detected,completed_at)
      VALUES(?,?,?,?,?,?,'completed',?,?,?,?,datetime('now'))`).bind(runId, job.tenant_id, job.document_id, job.id, result.provider, result.model, confidence, extractionKey, data.orientation_correction_applied ? 1 : 0, data.handwriting_detected ? 1 : 0),
    env.CYPHER.prepare(`INSERT INTO document_artifacts(id,tenant_id,document_id,artifact_type,object_key,content_sha256,content_type,size_bytes,version)
      VALUES(?,?,?,'extraction',?,?,'application/json',?,?)`).bind(artifactId, job.tenant_id, job.document_id, extractionKey, extractionHash, extractionBytes.byteLength, extractionVersion),
    env.CYPHER.prepare(`UPDATE documents SET document_type=CASE WHEN ? IN ('invoice','purchase_order','receipt','other') THEN ? ELSE document_type END,
      status='needs_review',invoice_number=?,po_number=?,document_date=?,invoice_total_minor=?,po_total_minor=?,tax_total_minor=?,currency=COALESCE(?,currency),
      match_status=CASE WHEN ? IN ('pending','matched','variance','unmatched','duplicate','resolved') THEN ? ELSE 'pending' END,difference_minor=?,extraction_confidence=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
      .bind(data.document_type, data.document_type, data.invoice_number, data.po_number, data.invoice_date, minorUnits(data.invoice_total), minorUnits(data.po_total), minorUnits(data.tax_total), clean(data.currency, 3).toUpperCase() || null, data.match_status, data.match_status, minorUnits(data.difference_amount), confidence, job.document_id, job.tenant_id),
    env.CYPHER.prepare("UPDATE processing_jobs SET status='completed',provider=?,completed_at=datetime('now'),last_error_code=NULL,last_error_message=NULL,updated_at=datetime('now') WHERE id=?").bind(result.provider, job.id),
    ...fields, ...lineStatements,
  ]);
  if (data.store_number) {
    const storeId = crypto.randomUUID();
    await env.CYPHER.prepare("INSERT INTO stores(id,tenant_id,store_number) VALUES(?,?,?) ON CONFLICT(tenant_id,store_number) DO NOTHING").bind(storeId, job.tenant_id, clean(data.store_number, 40)).run();
    await env.CYPHER.prepare("UPDATE documents SET store_id=(SELECT id FROM stores WHERE tenant_id=? AND store_number=?) WHERE id=? AND tenant_id=?").bind(job.tenant_id, clean(data.store_number, 40), job.document_id, job.tenant_id).run();
  }
  if (data.supplier_legal_name) {
    const vendorNumber = clean(data.vendor_id, 80) || null, vendor = vendorNumber
      ? await env.CYPHER.prepare("SELECT id FROM vendors WHERE tenant_id=? AND vendor_number=?").bind(job.tenant_id, vendorNumber).first()
      : await env.CYPHER.prepare("SELECT id FROM vendors WHERE tenant_id=? AND lower(legal_name)=lower(?)").bind(job.tenant_id, clean(data.supplier_legal_name, 200)).first();
    const vendorId = vendor?.id || crypto.randomUUID();
    if (!vendor) await env.CYPHER.prepare("INSERT INTO vendors(id,tenant_id,legal_name,dba_name,vendor_number) VALUES(?,?,?,?,?)").bind(vendorId, job.tenant_id, clean(data.supplier_legal_name, 200), clean(data.supplier_dba, 200) || null, vendorNumber).run();
    await env.CYPHER.prepare("UPDATE documents SET vendor_id=? WHERE id=? AND tenant_id=?").bind(vendorId, job.document_id, job.tenant_id).run();
  }
  const invoiceMinor = minorUnits(data.invoice_total), poMinor = minorUnits(data.po_total), difference = invoiceMinor !== null && poMinor !== null ? invoiceMinor - poMinor : null;
  const lineVariance = lineItems.some((item) => { const po = minorUnits(item.po_line_price), invoice = minorUnits(item.invoice_line_price); return po !== null && invoice !== null && po !== invoice; });
  if (difference !== null) await env.CYPHER.prepare("UPDATE documents SET match_status=?,difference_minor=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(difference === 0 && !lineVariance ? "matched" : "variance", difference, job.document_id, job.tenant_id).run();
  if (lineItems.length) await env.CYPHER.prepare(`INSERT INTO document_fields(id,tenant_id,document_id,field_key,field_label,extracted_value,confidence,source_provider,is_required)
    VALUES(?,?,?,?,?,?,?,?,0) ON CONFLICT(tenant_id,document_id,field_key) DO UPDATE SET extracted_value=excluded.extracted_value,confidence=excluded.confidence,source_provider=excluded.source_provider`)
    .bind(crypto.randomUUID(), job.tenant_id, job.document_id, "line_item_match_status", "Line item match status", lineVariance ? "pricing_variance" : "matched", confidence, result.provider).run();
  const relationships = [];
  if (data.invoice_number) {
    const duplicates = await env.CYPHER.prepare("SELECT id,original_filename,uploaded_at FROM documents WHERE tenant_id=? AND id<>? AND invoice_number=? ORDER BY uploaded_at DESC LIMIT 10").bind(job.tenant_id, job.document_id, clean(data.invoice_number, 160)).all();
    for (const related of duplicates.results || []) relationships.push({ related, type: "duplicate_invoice", explanation: `Invoice ${clean(data.invoice_number, 160)} was previously found on ${related.original_filename}, submitted ${related.uploaded_at}. Secretary review is required before replacement or resolution.` });
  }
  if (data.po_number) {
    const reused = await env.CYPHER.prepare("SELECT d.id,d.original_filename,d.uploaded_at,d.document_type,d.invoice_total_minor,d.po_total_minor,s.store_number FROM documents d LEFT JOIN stores s ON s.id=d.store_id WHERE d.tenant_id=? AND d.id<>? AND d.po_number=? ORDER BY d.uploaded_at DESC LIMIT 20").bind(job.tenant_id, job.document_id, clean(data.po_number, 160)).all();
    for (const related of reused.results || []) {
      const complementary = new Set([data.document_type, related.document_type]).has("invoice") && new Set([data.document_type, related.document_type]).has("purchase_order");
      if (complementary) {
        const pairInvoice = invoiceMinor ?? related.invoice_total_minor, pairPo = poMinor ?? related.po_total_minor;
        const pairDifference = pairInvoice !== null && pairInvoice !== undefined && pairPo !== null && pairPo !== undefined ? Number(pairInvoice) - Number(pairPo) : null;
        const relatedLines = (await env.CYPHER.prepare("SELECT line_index,po_line_price_minor,invoice_line_price_minor FROM document_line_items WHERE tenant_id=? AND document_id=? ORDER BY line_index").bind(job.tenant_id, related.id).all()).results || [];
        const relatedByIndex = Object.fromEntries(relatedLines.map((item) => [Number(item.line_index), item]));
        const pairLineVariance = lineItems.some((item, index) => {
          const relatedItem = relatedByIndex[index]; if (!relatedItem) return false;
          const currentPo = minorUnits(item.po_line_price), currentInvoice = minorUnits(item.invoice_line_price);
          const comparedPo = currentPo ?? relatedItem.po_line_price_minor, comparedInvoice = currentInvoice ?? relatedItem.invoice_line_price_minor;
          return comparedPo !== null && comparedPo !== undefined && comparedInvoice !== null && comparedInvoice !== undefined && Number(comparedPo) !== Number(comparedInvoice);
        });
        const pairStatus = pairDifference === null ? "pending" : pairDifference === 0 && !lineVariance && !pairLineVariance ? "matched" : "variance";
        if (pairDifference !== null) await env.CYPHER.prepare("UPDATE documents SET match_status=?,difference_minor=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(pairStatus, pairDifference, job.document_id, job.tenant_id).run();
        if (pairLineVariance) await env.CYPHER.prepare("UPDATE document_fields SET extracted_value='pricing_variance' WHERE tenant_id=? AND document_id=? AND field_key='line_item_match_status'").bind(job.tenant_id, job.document_id).run();
        relationships.push({ related, type: "po_match", explanation: `PO ${data.po_number} is paired with ${related.original_filename}. Invoice and PO totals ${pairDifference === null ? "require Secretary confirmation" : pairDifference === 0 ? "match" : `differ by ${Math.abs(pairDifference) / 100}`}${pairLineVariance ? "; a line-item pricing variance was detected" : "; line-item evidence remains subject to review"}.` });
      } else relationships.push({ related, type: "reused_po", explanation: `PO ${data.po_number} was previously found on ${related.original_filename}${related.store_number ? ` for Store ${related.store_number}` : ""}, submitted ${related.uploaded_at}. Reuse is contextual evidence and is not automatically rejected.` });
    }
  }
  for (const relationship of relationships) await env.CYPHER.prepare(`INSERT INTO document_relationships(id,tenant_id,source_document_id,related_document_id,relationship_type,explanation)
    VALUES(?,?,?,?,?,?) ON CONFLICT(tenant_id,source_document_id,related_document_id,relationship_type) DO UPDATE SET explanation=excluded.explanation`)
    .bind(crypto.randomUUID(), job.tenant_id, job.document_id, relationship.related.id, relationship.type, relationship.explanation).run();
  const settings = await env.CYPHER.prepare("SELECT resolution_required_days FROM tenant_settings WHERE tenant_id=?").bind(job.tenant_id).first();
  const anchor = data.invoice_date || new Date().toISOString().slice(0, 10), due = new Date(anchor); due.setUTCDate(due.getUTCDate() + Number(settings?.resolution_required_days || 90));
  const dueAt = Number.isNaN(due.getTime()) ? null : due.toISOString().slice(0, 10), unmatched = !data.po_number || invoiceMinor === null || poMinor === null;
  await env.CYPHER.prepare(`INSERT INTO document_exposure(tenant_id,document_id,classification,amount_minor,due_at,resolution_required)
    VALUES(?,?,?,?,?,CASE WHEN ? IS NOT NULL AND date(?)<=date('now') THEN 1 ELSE 0 END)
    ON CONFLICT(document_id) DO UPDATE SET classification=excluded.classification,amount_minor=excluded.amount_minor,due_at=excluded.due_at,resolution_required=excluded.resolution_required,updated_at=datetime('now')`)
    .bind(job.tenant_id, job.document_id, unmatched ? "unmatched" : "cleared", Math.max(0, invoiceMinor || 0), dueAt, dueAt, dueAt).run();
  if (data.store_number) await relocateDocumentArtifacts(env, job.tenant_id, job.document_id, clean(data.store_number, 40), data.invoice_date);
}

async function relocateDocumentArtifacts(env, tenantId, documentId, storeNumber, documentDate) {
  const tenant = await env.CYPHER.prepare("SELECT slug FROM tenants WHERE id=?").bind(tenantId).first(); if (!tenant) return;
  const parsed = new Date(documentDate || Date.now()), valid = !Number.isNaN(parsed.getTime()), year = valid ? parsed.getUTCFullYear() : new Date().getUTCFullYear(), month = String((valid ? parsed.getUTCMonth() : new Date().getUTCMonth()) + 1).padStart(2, "0");
  const prefix = `tenants/${tenant.slug}/stores/${storeNumber}/${year}/${month}/${documentId}`;
  const artifacts = (await env.CYPHER.prepare("SELECT id,artifact_type,object_key,content_type,version FROM document_artifacts WHERE tenant_id=? AND document_id=? AND artifact_type IN ('original','extraction')").bind(tenantId, documentId).all()).results || [];
  for (const artifact of artifacts) {
    const filename = artifact.artifact_type === "original" ? "original.pdf" : Number(artifact.version || 1) === 1 ? "extraction.json" : `extraction-v${artifact.version}.json`, target = `${prefix}/${filename}`; if (artifact.object_key === target) continue;
    const object = await env.CYPHER_FILES.get(artifact.object_key); if (!object) continue;
    await env.CYPHER_FILES.put(target, object.body, { httpMetadata: object.httpMetadata, customMetadata: object.customMetadata });
    await env.CYPHER.prepare("UPDATE document_artifacts SET object_key=? WHERE id=? AND tenant_id=?").bind(target, artifact.id, tenantId).run();
    await env.CYPHER_FILES.delete(artifact.object_key);
  }
}

async function processCypherJob(message, env) {
  const body = message.body || {}, jobId = clean(body.jobId, 64), tenantId = clean(body.tenantId, 64), documentId = clean(body.documentId, 64);
  if (body.schema !== "cypher-job/v1" || !jobId || !tenantId || !documentId) { message.ack(); return; }
  const job = await env.CYPHER.prepare("SELECT * FROM processing_jobs WHERE id=? AND tenant_id=? AND document_id=?").bind(jobId, tenantId, documentId).first();
  if (!job || ["completed", "cancelled"].includes(job.status)) { message.ack(); return; }
  const provider = env.CYPHER_AZURE_ENABLED === "true" && env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && env.AZURE_DOCUMENT_INTELLIGENCE_KEY
    ? "azure_document_intelligence" : env.CYPHER_OPENAI_ENABLED === "true" && env.OPENAI_API_KEY && env.CYPHER_OPENAI_MODEL ? "openai_vision" : null;
  if (!provider) {
    await env.CYPHER.batch([
      env.CYPHER.prepare("UPDATE processing_jobs SET status='failed',attempt_count=attempt_count+1,last_error_code='OCR_CONFIGURATION_REQUIRED',last_error_message='No OCR provider is enabled and configured.',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?").bind(jobId),
      env.CYPHER.prepare("UPDATE documents SET status='needs_review',updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(documentId, tenantId),
    ]);
    console.warn(JSON.stringify({ event: "cypher_job_requires_configuration", job_id: jobId, document_id: documentId }));
    message.ack(); return;
  }
  await env.CYPHER.batch([
    env.CYPHER.prepare("UPDATE processing_jobs SET status='processing',provider=?,attempt_count=attempt_count+1,started_at=COALESCE(started_at,datetime('now')),updated_at=datetime('now') WHERE id=?").bind(provider, jobId),
    env.CYPHER.prepare("UPDATE documents SET status='processing',updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(documentId, tenantId),
  ]);
  if (provider === "openai_vision" || provider === "azure_document_intelligence") {
    const artifact = await env.CYPHER.prepare("SELECT object_key FROM document_artifacts WHERE tenant_id=? AND document_id=? AND artifact_type='original' ORDER BY version DESC LIMIT 1").bind(tenantId, documentId).first();
    const document = await env.CYPHER.prepare("SELECT original_filename FROM documents WHERE tenant_id=? AND id=?").bind(tenantId, documentId).first();
    const object = artifact && await env.CYPHER_FILES.get(artifact.object_key); if (!object) throw Object.assign(new Error("Original PDF is missing from private storage."), { code: "ORIGINAL_MISSING" });
    let result;
    if (provider === "azure_document_intelligence") {
      try { result = await extractWithAzure(env, object); }
      catch (azureError) {
        if (env.CYPHER_OPENAI_ENABLED !== "true" || !env.OPENAI_API_KEY) throw azureError;
        console.warn(JSON.stringify({ event: "cypher_azure_fallback", job_id: jobId, document_id: documentId, error_code: clean(azureError?.code || "AZURE_PROVIDER_ERROR", 80) }));
        const freshObject = await env.CYPHER_FILES.get(artifact.object_key);
        result = await extractWithOpenAI(env, freshObject, document.original_filename, tenantId);
      }
      const threshold = Number((await env.CYPHER.prepare("SELECT confidence_threshold FROM tenant_settings WHERE tenant_id=?").bind(tenantId).first())?.confidence_threshold || 0.95);
      const missingIdentity = !result.data.invoice_number || !result.data.po_number;
      const customFieldCount = Number((await env.CYPHER.prepare("SELECT COUNT(*) AS total FROM tenant_field_definitions WHERE tenant_id=? AND active=1").bind(tenantId).first())?.total || 0);
      if (result.provider === "azure_document_intelligence" && (missingIdentity || customFieldCount > 0 || Number(result.data.extraction_confidence || 0) < threshold) && env.CYPHER_OPENAI_ENABLED === "true" && env.OPENAI_API_KEY) {
        const freshObject = await env.CYPHER_FILES.get(artifact.object_key); result = await extractWithOpenAI(env, freshObject, document.original_filename, tenantId);
      }
    } else result = await extractWithOpenAI(env, object, document.original_filename, tenantId);
    await persistExtraction(env, job, result, artifact.object_key); message.ack(); return;
  }
}

function webauthnContext(request) {
  const url = new URL(request.url);
  return { origin: url.origin, rpID: url.hostname };
}
async function createPlatformSession(request, env, adminId, authMethod) {
  const token = randomToken(), fingerprint = await requestFingerprint(request, env);
  await env.CYPHER.prepare(`INSERT INTO platform_admin_sessions(id,admin_id,token_hash,auth_method,mfa_verified_at,expires_at,ip_hash,user_agent_hash)
    VALUES(?,?,?, ?,datetime('now'),datetime('now','+8 hours'),?,?)`)
    .bind(crypto.randomUUID(), adminId, await sha256(token), authMethod, fingerprint.ipHash, fingerprint.userAgentHash).run();
  return token;
}
async function beginPlatformBootstrap(request, env) {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  const ownerEmail = clean(env.PLATFORM_OWNER_EMAIL, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return json({ message: "Platform Owner email is not configured." }, 503);
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!env.PLATFORM_BOOTSTRAP_TOKEN || !(await secretMatches(provided, env.PLATFORM_BOOTSTRAP_TOKEN))) return json({ message: "Bootstrap authorization failed." }, 401);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid enrollment request." }, 400); }
  const email = clean(body.email, 254).toLowerCase(), displayName = clean(body.display_name, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length < 2) return json({ message: "Enter a valid administrator name and email." }, 400);
  if (email !== ownerEmail) return json({ message: "This email is not authorized for Platform Owner enrollment." }, 403);
  const active = await env.CYPHER.prepare("SELECT COUNT(*) AS total FROM platform_admins WHERE status='active'").first();
  if (Number(active?.total || 0) > 0) return json({ message: "Platform Owner bootstrap is already closed." }, 409);
  let admin = await env.CYPHER.prepare("SELECT id,email,display_name,status FROM platform_admins WHERE lower(email)=?").bind(email).first();
  if (!admin) {
    admin = { id: crypto.randomUUID(), email, display_name: displayName, status: "pending" };
    await env.CYPHER.prepare("INSERT INTO platform_admins(id,email,display_name,status) VALUES(?,?,?,'pending')").bind(admin.id, email, displayName).run();
  }
  if (admin.status !== "pending") return json({ message: "This administrator cannot use bootstrap enrollment." }, 409);
  const existing = await env.CYPHER.prepare("SELECT credential_id,transports FROM platform_webauthn_credentials WHERE admin_id=? AND revoked_at IS NULL").bind(admin.id).all();
  const context = webauthnContext(request);
  const options = await generateRegistrationOptions({ rpName: "Cypher Platform Administration", rpID: context.rpID,
    userName: admin.email, userDisplayName: admin.display_name, userID: encoder.encode(admin.id), attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "required" }, preferredAuthenticatorType: "remoteDevice",
    supportedAlgorithmIDs: [-7, -257], timeout: 300000,
    excludeCredentials: (existing.results || []).map((row) => ({ id: row.credential_id, transports: JSON.parse(row.transports || "[]") })) });
  const challengeId = crypto.randomUUID();
  await env.CYPHER.prepare(`INSERT INTO platform_webauthn_challenges(id,admin_id,challenge_hash,challenge,request_origin,ceremony,expires_at)
    VALUES(?,?,?,?,?,'registration',datetime('now','+5 minutes'))`)
    .bind(challengeId, admin.id, await sha256(options.challenge), options.challenge, context.origin).run();
  return json({ challenge_id: challengeId, options });
}
async function finishPlatformBootstrap(request, env) {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!env.PLATFORM_BOOTSTRAP_TOKEN || !(await secretMatches(provided, env.PLATFORM_BOOTSTRAP_TOKEN))) return json({ message: "Bootstrap authorization failed." }, 401);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid passkey response." }, 400); }
  const challenge = await env.CYPHER.prepare(`SELECT c.*,a.email,a.display_name,a.status AS admin_status FROM platform_webauthn_challenges c
    JOIN platform_admins a ON a.id=c.admin_id WHERE c.id=? AND c.ceremony='registration' AND c.used_at IS NULL AND c.expires_at>datetime('now')`)
    .bind(clean(body.challenge_id, 64)).first();
  if (!challenge || challenge.admin_status !== "pending") return json({ message: "Enrollment challenge is invalid or expired." }, 400);
  const context = webauthnContext(request);
  if (challenge.request_origin !== context.origin) return json({ message: "Enrollment origin changed. Start again." }, 400);
  let verification;
  try { verification = await verifyRegistrationResponse({ response: body.response, expectedChallenge: challenge.challenge,
    expectedOrigin: context.origin, expectedRPID: context.rpID, requireUserVerification: true, supportedAlgorithmIDs: [-7, -257] }); }
  catch (error) { console.error(JSON.stringify({ event: "platform_passkey_registration_failed", message: error?.message })); return json({ message: "The iPhone passkey could not be verified." }, 400); }
  if (!verification.verified || !verification.registrationInfo?.userVerified) return json({ message: "Face ID or device verification is required." }, 400);
  const info = verification.registrationInfo, credential = info.credential, credentialId = credential.id;
  const sessionToken = await createPlatformSession(request, env, challenge.admin_id, "webauthn_passkey");
  await env.CYPHER.batch([
    env.CYPHER.prepare(`INSERT INTO platform_webauthn_credentials(id,admin_id,credential_id,public_key,sign_count,transports,device_type,backed_up,device_label)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), challenge.admin_id, credentialId, bytesToBase64Url(credential.publicKey), credential.counter,
        JSON.stringify(body.response?.response?.transports || credential.transports || []), info.credentialDeviceType, info.credentialBackedUp ? 1 : 0, "iPhone passkey"),
    env.CYPHER.prepare("INSERT OR IGNORE INTO platform_admin_roles(admin_id,role) VALUES(?,'platform_owner')").bind(challenge.admin_id),
    env.CYPHER.prepare("UPDATE platform_admins SET status='active',activated_at=datetime('now'),last_login_at=datetime('now') WHERE id=?").bind(challenge.admin_id),
    env.CYPHER.prepare("UPDATE platform_webauthn_challenges SET used_at=datetime('now'),challenge=NULL WHERE id=?").bind(challenge.id),
    env.CYPHER.prepare("INSERT INTO platform_admin_audit(id,admin_id,event_type,target_type,target_id,details) VALUES(?,?,'platform_owner_enrolled','platform_admin',?,'{\"authenticator\":\"iphone_passkey\"}')")
      .bind(crypto.randomUUID(), challenge.admin_id, challenge.admin_id),
  ]);
  return json({ ok: true }, 201, { "set-cookie": platformAuthCookie(sessionToken) });
}
async function beginPlatformAuthentication(request, env) {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid sign-in request." }, 400); }
  const email = clean(body.email, 254).toLowerCase();
  const admin = await env.CYPHER.prepare("SELECT id FROM platform_admins WHERE lower(email)=? AND status='active'").bind(email).first();
  if (!admin) return json({ message: "No eligible passkey account was found." }, 401);
  const credentials = await env.CYPHER.prepare("SELECT credential_id,transports FROM platform_webauthn_credentials WHERE admin_id=? AND revoked_at IS NULL").bind(admin.id).all();
  if (!(credentials.results || []).length) return json({ message: "No eligible passkey account was found." }, 401);
  const context = webauthnContext(request);
  const options = await generateAuthenticationOptions({ rpID: context.rpID, userVerification: "required", timeout: 300000,
    allowCredentials: credentials.results.map((row) => ({ id: row.credential_id, transports: JSON.parse(row.transports || "[]") })) });
  const challengeId = crypto.randomUUID();
  await env.CYPHER.prepare(`INSERT INTO platform_webauthn_challenges(id,admin_id,challenge_hash,challenge,request_origin,ceremony,expires_at)
    VALUES(?,?,?,?,?,'authentication',datetime('now','+5 minutes'))`)
    .bind(challengeId, admin.id, await sha256(options.challenge), options.challenge, context.origin).run();
  return json({ challenge_id: challengeId, options });
}
async function finishPlatformAuthentication(request, env) {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  let body; try { body = await request.json(); } catch { return json({ message: "Invalid passkey response." }, 400); }
  const challenge = await env.CYPHER.prepare(`SELECT c.* FROM platform_webauthn_challenges c JOIN platform_admins a ON a.id=c.admin_id
    WHERE c.id=? AND c.ceremony='authentication' AND c.used_at IS NULL AND c.expires_at>datetime('now') AND a.status='active'`)
    .bind(clean(body.challenge_id, 64)).first();
  if (!challenge) return json({ message: "Sign-in challenge is invalid or expired." }, 400);
  const stored = await env.CYPHER.prepare(`SELECT * FROM platform_webauthn_credentials WHERE admin_id=? AND credential_id=? AND revoked_at IS NULL`)
    .bind(challenge.admin_id, clean(body.response?.id, 2048)).first();
  if (!stored) return json({ message: "The passkey is not registered for this account." }, 401);
  const context = webauthnContext(request);
  if (challenge.request_origin !== context.origin) return json({ message: "Sign-in origin changed. Start again." }, 400);
  let verification;
  try { verification = await verifyAuthenticationResponse({ response: body.response, expectedChallenge: challenge.challenge,
    expectedOrigin: context.origin, expectedRPID: context.rpID, requireUserVerification: true,
    credential: { id: stored.credential_id, publicKey: base64UrlToBytes(stored.public_key), counter: Number(stored.sign_count), transports: JSON.parse(stored.transports || "[]") } }); }
  catch (error) { console.error(JSON.stringify({ event: "platform_passkey_auth_failed", message: error?.message })); return json({ message: "The iPhone passkey could not be verified." }, 401); }
  if (!verification.verified || !verification.authenticationInfo.userVerified) return json({ message: "Face ID or device verification is required." }, 401);
  const sessionToken = await createPlatformSession(request, env, challenge.admin_id, "webauthn_passkey");
  await env.CYPHER.batch([
    env.CYPHER.prepare("UPDATE platform_webauthn_credentials SET sign_count=?,device_type=?,backed_up=?,last_used_at=datetime('now') WHERE id=?")
      .bind(verification.authenticationInfo.newCounter, verification.authenticationInfo.credentialDeviceType,
        verification.authenticationInfo.credentialBackedUp ? 1 : 0, stored.id),
    env.CYPHER.prepare("UPDATE platform_webauthn_challenges SET used_at=datetime('now'),challenge=NULL WHERE id=?").bind(challenge.id),
    env.CYPHER.prepare("UPDATE platform_admins SET last_login_at=datetime('now') WHERE id=?").bind(challenge.admin_id),
    env.CYPHER.prepare("INSERT INTO platform_admin_audit(id,admin_id,event_type,details) VALUES(?,?,'platform_admin_signed_in','{\"authenticator\":\"passkey\"}')")
      .bind(crypto.randomUUID(), challenge.admin_id),
  ]);
  return json({ ok: true }, 200, { "set-cookie": platformAuthCookie(sessionToken) });
}

async function currentPlatformAdmin(request, env, allowedRoles = null) {
  const token = parseCookies(request)[PLATFORM_SESSION_COOKIE];
  if (!token || token.length > 128) return null;
  const admin = await env.CYPHER.prepare(`SELECT s.id AS session_id,s.admin_id,s.auth_method,s.mfa_verified_at,
    a.email,a.display_name,a.status,GROUP_CONCAT(r.role) AS roles
    FROM platform_admin_sessions s JOIN platform_admins a ON a.id=s.admin_id
    JOIN platform_admin_roles r ON r.admin_id=a.id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>datetime('now')
      AND s.last_seen_at>datetime('now','-30 minutes') AND s.mfa_verified_at>datetime('now','-12 hours')
      AND a.status='active' AND s.auth_method IN ('webauthn_passkey','webauthn_security_key')
    GROUP BY s.id,a.id`).bind(await sha256(token)).first();
  if (!admin) return null;
  admin.roles = String(admin.roles || "").split(",").filter(Boolean);
  if (allowedRoles && !admin.roles.some((role) => allowedRoles.includes(role))) return null;
  await env.CYPHER.prepare("UPDATE platform_admin_sessions SET last_seen_at=datetime('now') WHERE id=?").bind(admin.session_id).run();
  return admin;
}
async function logoutPlatformAdmin(request, env) {
  if (!sameOrigin(request)) return json({ message: "Invalid request origin." }, 403);
  const token = parseCookies(request)[PLATFORM_SESSION_COOKIE];
  if (token) await env.CYPHER.prepare("UPDATE platform_admin_sessions SET revoked_at=datetime('now') WHERE token_hash=? AND revoked_at IS NULL").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "set-cookie": platformAuthCookie("", 0) });
}
async function getPlatformAdminSession(request, env) {
  const admin = await currentPlatformAdmin(request, env);
  if (!admin) return json({ authenticated: false, webauthn_required: true }, 401);
  return json({ authenticated: true, admin: { display_name: admin.display_name, email: admin.email, roles: admin.roles, auth_method: admin.auth_method } });
}
async function getPlatformOverview(request, env) {
  const admin = await currentPlatformAdmin(request, env, ["platform_owner","operations_admin","support_engineer","billing_admin","security_auditor","ai_operations"]);
  if (!admin) return json({ message: "Phishing-resistant administrator authentication required." }, 401);
  const [tenants, subscriptions, documents, failures, support, recent] = await Promise.all([
    env.CYPHER.prepare("SELECT COUNT(*) AS total FROM tenants WHERE status='active'").first(),
    env.CYPHER.prepare("SELECT COUNT(*) AS total FROM tenant_subscriptions WHERE status='active'").first(),
    env.CYPHER.prepare("SELECT COUNT(*) AS total FROM documents").first(),
    env.CYPHER.prepare("SELECT COUNT(*) AS total FROM documents WHERE status IN ('failed','quarantined')").first(),
    env.CYPHER.prepare("SELECT COUNT(*) AS total FROM platform_support_access WHERE status='pending'").first(),
    env.CYPHER.prepare(`SELECT event_type,target_type,target_id,created_at FROM platform_admin_audit
      ORDER BY created_at DESC LIMIT 10`).all(),
  ]);
  return json({ overview: { active_tenants: Number(tenants?.total || 0), active_subscriptions: Number(subscriptions?.total || 0),
    documents: Number(documents?.total || 0), processing_exceptions: Number(failures?.total || 0), pending_support: Number(support?.total || 0) },
    recent_activity: recent.results || [] });
}
async function listPlatformTenants(request, env) {
  const admin = await currentPlatformAdmin(request, env, ["platform_owner","operations_admin","support_engineer","billing_admin","security_auditor","ai_operations"]);
  if (!admin) return json({ message: "Phishing-resistant administrator authentication required." }, 401);
  const rows = await env.CYPHER.prepare(`SELECT t.id,t.slug,t.display_name,t.status,t.created_at,
    s.plan_code,s.status AS subscription_status,s.renews_at,s.document_limit_monthly,s.storage_limit_bytes,
    COUNT(DISTINCT m.user_id) AS users,COUNT(DISTINCT st.id) AS stores,COUNT(DISTINCT d.id) AS documents
    FROM tenants t LEFT JOIN tenant_subscriptions s ON s.tenant_id=t.id
    LEFT JOIN tenant_memberships m ON m.tenant_id=t.id AND m.status='active'
    LEFT JOIN stores st ON st.tenant_id=t.id AND st.status='active'
    LEFT JOIN documents d ON d.tenant_id=t.id
    GROUP BY t.id,s.tenant_id ORDER BY t.display_name LIMIT 200`).all();
  return json({ tenants: rows.results || [] });
}

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
      if (env.DEPLOYMENT_ENV === "staging" && path.startsWith("/api/")) {
        return json({ message: "Provider APIs are disabled in public staging." }, 503);
      }
      if (path === "/robots.txt") {
        return new Response("User-agent: *\nAllow: /\nSitemap: https://shikigamitechnologies.com/sitemap.xml\n", {
          headers: { "content-type": "text/plain;charset=utf-8", ...securityHeaders },
        });
      }
      if (path === "/sitemap.xml") {
        const entries = publicPaths.map((value) => `<url><loc>https://shikigamitechnologies.com${value}</loc></url>`).join("");
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`, {
          headers: { "content-type": "application/xml;charset=utf-8", "cache-control": "public,max-age=3600", ...securityHeaders },
        });
      }
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
      if (path === "/api/cypher/v1/companies") {
        if (request.method === "GET") return await listCypherCompanies(env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      if (path === "/api/cypher/v1/login") {
        if (request.method === "POST") return await loginCypher(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "POST" });
      }
      if (path === "/api/cypher/v1/session") {
        if (request.method === "GET") return await getCypherSession(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      if (path === "/api/cypher/v1/logout") {
        if (request.method === "POST") return await logoutCypher(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "POST" });
      }
      if (path === "/api/cypher/v1/overview") {
        if (request.method === "GET") return await getCypherOverview(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      if (path === "/api/cypher/v1/settings") {
        if (request.method === "GET") return await getCypherSettings(request, env);
        if (request.method === "PATCH") return await patchCypherSettings(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET, PATCH" });
      }
      if (path === "/api/cypher/v1/field-definitions") {
        if (request.method === "GET") return await listFieldDefinitions(request, env);
        if (request.method === "POST") return await createFieldDefinition(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET, POST" });
      }
      const fieldDefinitionMatch = path.match(/^\/api\/cypher\/v1\/field-definitions\/([0-9a-f-]{36})$/i);
      if (fieldDefinitionMatch) {
        if (request.method === "DELETE") return await deleteFieldDefinition(request, env, fieldDefinitionMatch[1]);
        return json({ message: "Method not allowed." }, 405, { allow: "DELETE" });
      }
      if (path === "/api/cypher/v1/reports/documents.csv") {
        if (request.method === "GET") return await exportCypherDocuments(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      if (path === "/api/cypher/v1/documents") {
        if (request.method === "GET") return await listCypherDocuments(request, env);
        if (request.method === "POST") return await createCypherDocument(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET, POST" });
      }
      if (path === "/api/cypher/v1/stores") {
        if (request.method === "GET") return await listCypherStores(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      if (path === "/api/cypher/v1/vendors") {
        if (request.method === "GET") return await listCypherVendors(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      if (path === "/api/cypher/v1/exposure") {
        if (request.method === "GET") return await listCypherExposure(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      const documentMatch = path.match(/^\/api\/cypher\/v1\/documents\/([0-9a-f-]{36})$/i);
      if (documentMatch) {
        if (request.method === "GET") return await getCypherDocument(request, env, documentMatch[1]);
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      const originalMatch = path.match(/^\/api\/cypher\/v1\/documents\/([0-9a-f-]{36})\/original$/i);
      if (originalMatch) {
        if (request.method === "GET") return await downloadCypherOriginal(request, env, originalMatch[1]);
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      const artifactMatch = path.match(/^\/api\/cypher\/v1\/documents\/([0-9a-f-]{36})\/(validation-pdf|evidence-manifest)$/i);
      if (artifactMatch) {
        if (request.method === "GET") return await downloadCypherArtifact(request, env, artifactMatch[1], artifactMatch[2] === "validation-pdf" ? "validation_pdf" : "evidence_manifest");
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      const validationMatch = path.match(/^\/api\/cypher\/v1\/documents\/([0-9a-f-]{36})\/validate$/i);
      if (validationMatch) {
        if (request.method === "POST") return await validateCypherDocument(request, env, validationMatch[1]);
        return json({ message: "Method not allowed." }, 405, { allow: "POST" });
      }
      const reprocessMatch = path.match(/^\/api\/cypher\/v1\/documents\/([0-9a-f-]{36})\/reprocess$/i);
      if (reprocessMatch) {
        if (request.method === "POST") return await reprocessCypherDocument(request, env, reprocessMatch[1]);
        return json({ message: "Method not allowed." }, 405, { allow: "POST" });
      }
      if (path === "/api/cypher/platform/v1/session") {
        if (request.method === "GET") return await getPlatformAdminSession(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      if (path === "/api/cypher/platform/v1/passkeys/bootstrap/options") {
        if (request.method === "POST") return await beginPlatformBootstrap(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "POST" });
      }
      if (path === "/api/cypher/platform/v1/passkeys/bootstrap/verify") {
        if (request.method === "POST") return await finishPlatformBootstrap(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "POST" });
      }
      if (path === "/api/cypher/platform/v1/passkeys/auth/options") {
        if (request.method === "POST") return await beginPlatformAuthentication(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "POST" });
      }
      if (path === "/api/cypher/platform/v1/passkeys/auth/verify") {
        if (request.method === "POST") return await finishPlatformAuthentication(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "POST" });
      }
      if (path === "/api/cypher/platform/v1/logout") {
        if (request.method === "POST") return await logoutPlatformAdmin(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "POST" });
      }
      if (path === "/api/cypher/platform/v1/overview") {
        if (request.method === "GET") return await getPlatformOverview(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      if (path === "/api/cypher/platform/v1/tenants") {
        if (request.method === "GET") return await listPlatformTenants(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      if (path === "/api/cypher/platform/v1/readiness") {
        if (request.method === "GET") return await getPlatformReadiness(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "GET" });
      }
      if (path === "/api/cypher/platform/v1/providers/supabase/check") {
        if (request.method === "POST") return await checkSupabaseReadiness(request, env);
        return json({ message: "Method not allowed." }, 405, { allow: "POST" });
      }
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
      return response;
    } catch (error) {
      console.error(JSON.stringify({ event: "worker_request_failed", path, message: error?.message }));
      return json({ message: "The service is temporarily unavailable." }, 503);
    }
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      try { await processCypherJob(message, env); }
      catch (error) {
        console.error(JSON.stringify({ event: "cypher_queue_job_failed", message_id: message.id, attempt: message.attempts, message: error?.message }));
        const body = message.body || {}, finalAttempt = message.attempts >= 5;
        if (body.jobId && body.tenantId && body.documentId) await env.CYPHER.batch([
          env.CYPHER.prepare("UPDATE processing_jobs SET status=?,last_error_code=?,last_error_message=?,completed_at=CASE WHEN ? THEN datetime('now') ELSE completed_at END,updated_at=datetime('now') WHERE id=? AND tenant_id=? AND document_id=?")
            .bind(finalAttempt ? "failed" : "retrying", clean(error?.code || "PROVIDER_ERROR", 80), clean(error?.message || "Provider processing failed.", 500), finalAttempt ? 1 : 0, body.jobId, body.tenantId, body.documentId),
          env.CYPHER.prepare("UPDATE documents SET status=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(finalAttempt ? "needs_review" : "queued", body.documentId, body.tenantId),
        ]);
        if (finalAttempt) message.ack(); else message.retry({ delaySeconds: Math.min(900, 30 * message.attempts) });
      }
    }
  },
};
