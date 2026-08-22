const HEX64 = /^[0-9a-f]{64}$/;
const ID = /^[0-9a-f-]{36}$/i;
const MAX_BYTES = 15 * 1024 * 1024;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export class SupabasePrivateStorageAdapter {
  constructor({ origin, bucket, token, apikey, contentType = "application/pdf", fetchImpl = fetch }) {
    this.origin = approvedEndpoint(origin, { local: new URL(origin).protocol === "http:" }).origin;
    if (!/^[a-z0-9][a-z0-9._-]{1,62}$/i.test(bucket)) throw new Error("invalid_bucket");
    if (!token || !apikey) throw new Error("storage_auth_required");
    this.bucket = bucket; this.token = token; this.apikey = apikey; this.contentType = contentType; this.fetch = fetchImpl;
  }
  url(path) { return `${this.origin}/storage/v1/object/authenticated/${encodeURIComponent(this.bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`; }
  mutationUrl(path) { return `${this.origin}/storage/v1/object/${encodeURIComponent(this.bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`; }
  async request(path, init = {}) {
    const response = await this.fetch(init.mutation ? this.mutationUrl(path) : this.url(path), { ...init, mutation: undefined, redirect: "manual", headers: { apikey: this.apikey, authorization: `Bearer ${this.token}`, ...(init.headers || {}) } });
    if (response.status >= 300 && response.status < 400) throw new Error("storage_redirect_denied");
    if (!response.ok) throw new Error(`storage_http_${response.status}:${(await response.text()).slice(0,256)}`);
    return response;
  }
  async upload(path, bytes, { upsert = false, signal } = {}) { await this.request(path, { mutation: true, method: "POST", body: bytes, signal, headers: { "content-type": this.contentType, "x-upsert": String(upsert) } }); }
  async head(path, { signal } = {}) { try { const r = await this.request(path, { method: "HEAD", signal }); return { size: Number(r.headers.get("content-length")), version: r.headers.get("etag") || r.headers.get("last-modified") }; } catch (e) { if (e.message.startsWith("storage_http_404")) return null; throw e; } }
  async *download(path, { version, signal } = {}) { const r = await this.request(path, { method: "GET", signal, headers: version ? { "if-match": version } : {} }); if (version && r.headers.get("etag") && r.headers.get("etag") !== version) throw new Error("storage_version_mismatch"); if (!r.body) throw new Error("storage_body_missing"); for await (const chunk of r.body) yield chunk; }
  async delete(path, { signal } = {}) { await this.request(path, { mutation: true, method: "DELETE", signal }); }
}

export function confinedPath(tenantId, intentId, value) {
  if (!ID.test(tenantId) || !ID.test(intentId)) throw new Error("invalid_identity");
  const prefix = `${tenantId}/${intentId}/`;
  if (typeof value !== "string" || !value.startsWith(prefix) || value.includes("\\") || value.includes("//") || value.split("/").some((x) => !x || x === "." || x === "..")) throw new Error("path_confinement");
  return value;
}

export function approvedEndpoint(raw, { local = true } = {}) {
  const url = new URL(raw);
  if (url.username || url.password || url.hash || url.protocol !== (local ? "http:" : "https:")) throw new Error("endpoint_denied");
  if (local && !LOCAL_HOSTS.has(url.hostname)) throw new Error("endpoint_denied");
  if (!local && /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)/i.test(url.hostname)) throw new Error("private_address_denied");
  return url;
}

async function sha256(stream, maximum = MAX_BYTES) {
  const chunks = []; let size = 0;
  for await (const part of stream) { const bytes = part instanceof Uint8Array ? part : new Uint8Array(part); size += bytes.byteLength; if (size > maximum) throw new Error("stream_truncated_or_oversize"); chunks.push(bytes); }
  const joined = new Uint8Array(size); let offset = 0; for (const x of chunks) { joined.set(x, offset); offset += x.byteLength; }
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", joined))].map((x) => x.toString(16).padStart(2, "0")).join("");
  return { digest, size };
}

function deliveryBinding(job, kind) {
  if (!job?.tenantId || !job?.idempotencyKey || !job?.key || !HEX64.test(job.sourceDigest || "") || !(job.bytes instanceof Uint8Array)) throw new Error("invalid_delivery_request");
  return Object.freeze({ tenantId: job.tenantId, destinationKind: kind, destinationPath: job.key, sourceDigest: job.sourceDigest, payloadSize: job.bytes.byteLength, stableJobId: job.jobId || job.idempotencyKey, idempotencyKey: job.idempotencyKey });
}
const requestFingerprint = binding => JSON.stringify(binding);
function assertReplay(prior, fingerprint) { if (!prior || prior.requestFingerprint !== fingerprint) throw new Error("idempotency_conflict"); }

// store is an official-API adapter: upload/head/download/delete; db owns one atomic transaction.
export async function verifyPrivateUpload({ intent, bytes, store, db, signal }) {
  if (signal?.aborted) throw new Error("cancelled");
  if (!intent || intent.state !== "awaiting_upload" || intent.requested_size < 1 || intent.requested_size > MAX_BYTES) throw new Error("invalid_intent");
  const path = confinedPath(intent.tenant_id, intent.id, intent.object_path);
  {
    const meta1 = await store.head(path, { signal });
    if (!meta1 || meta1.size !== intent.requested_size || !meta1.version) throw new Error("object_missing_or_size_mismatch");
    const observed = await sha256(store.download(path, { version: meta1.version, signal }), intent.requested_size);
    if (observed.size !== intent.requested_size || !HEX64.test(observed.digest)) throw new Error("digest_or_size_mismatch");
    const meta2 = await store.head(path, { signal });
    if (!meta2 || meta2.version !== meta1.version || meta2.size !== meta1.size) throw new Error("object_race_or_swap");
    return await db.atomicFinalize({ tenant_id: intent.tenant_id, upload_intent_id: intent.id, object_path: path, content_hash: observed.digest, size_bytes: observed.size, storage_version: meta1.version, verification_method: "storage_api_head_streamed_sha256" });
  }
}

export async function uploadAndVerifyPrivateUpload(options) {
  const path = confinedPath(options.intent.tenant_id, options.intent.id, options.intent.object_path);
  await options.store.upload(path, options.bytes, { upsert: false, signal: options.signal });
  return verifyPrivateUpload(options);
}

export class LocalDestinationEmulator {
  constructor(kind, options = {}) { this.kind = kind; this.options = options; this.objects = new Map(); this.receipts = new Map(); }
  async deliver({ tenantId, key, bytes, sourceDigest, attemptKey, requestBinding, requestFingerprint: fingerprint, oauth, signal }) {
    if (signal?.aborted) throw new Error("cancelled");
    confinedPath(tenantId, tenantId, `${tenantId}/${tenantId}/${key}`);
    const requiredScope = this.kind === "drive" ? "https://www.googleapis.com/auth/drive.file" : ["sharepoint","onedrive"].includes(this.kind) ? "Files.ReadWrite" : null;
    if (requiredScope && (!oauth || oauth.expiresAt <= Date.now() || oauth.revoked || !oauth.scopes?.includes(requiredScope))) throw new Error("oauth_denied");
    if (this.kind === "sftp" && this.options.hostKey !== this.options.pinnedHostKey) throw new Error("host_key_mismatch");
    if (this.kind === "webhook") approvedEndpoint(this.options.url, { local: true });
    const prior = this.receipts.get(attemptKey); if (prior) { assertReplay(prior, fingerprint); return prior; }
    if (!this.options.allowOverwrite && this.objects.has(key)) {
      const recovered = this.objects.get(key), recoveredDigest = (await sha256([recovered])).digest;
      if (recoveredDigest !== sourceDigest) throw new Error("overwrite_denied");
      const receipt = Object.freeze({ destinationId: `${this.kind}:${key}`, observedDigest: recoveredDigest, status: "delivered_verified", attemptKey, requestBinding, requestFingerprint: fingerprint, recovered: true });
      this.receipts.set(attemptKey, receipt); return receipt;
    }
    this.objects.set(key, new Uint8Array(this.options.partial ? bytes.slice(0, -1) : bytes));
    if (this.options.outageAfterWrite) throw new Error("lost_response_after_write");
    const independentlyRead = this.objects.get(key);
    const observed = this.options.omitDigest ? null : (await sha256([independentlyRead])).digest;
    if (observed && observed !== sourceDigest) throw new Error("destination_digest_mismatch");
    const receipt = Object.freeze({ destinationId: `${this.kind}:${key}`, observedDigest: observed, status: observed ? "delivered_verified" : "delivered_unverified", attemptKey, requestBinding, requestFingerprint: fingerprint });
    this.receipts.set(attemptKey, receipt); return receipt;
  }
}

export function liveAdapter(config = {}) {
  if (config.approval !== "EXACT_LIVE_CONNECTOR_APPROVAL" || !Array.isArray(config.grants) || !config.grants.includes("write")) throw new Error("live_adapter_blocked");
  throw new Error("live_adapter_not_available_in_sandbox");
}

export async function dispatchDelivery(job, adapter, ledger, { maxAttempts = 3, signal } = {}) {
  const binding = deliveryBinding(job, adapter.kind), fingerprint = requestFingerprint(binding);
  const existing = await ledger.get(job.tenantId, job.idempotencyKey); if (existing) { assertReplay(existing, fingerprint); return existing; }
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error("cancelled");
    try { const receipt = await adapter.deliver({ ...job, attemptKey: job.idempotencyKey, requestBinding: binding, requestFingerprint: fingerprint, signal }); const recorded = await ledger.atomicRecord({ ...job, requestBinding: binding, requestFingerprint: fingerprint }, receipt); assertReplay(recorded, fingerprint); return recorded; }
    catch (error) { last = error; if (/denied|mismatch|cancelled|blocked/.test(error.message) || attempt === maxAttempts) throw error; await new Promise((resolve) => setTimeout(resolve, Math.min(10 * 2 ** attempt, 50))); }
  }
  throw last;
}
