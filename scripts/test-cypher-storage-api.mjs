import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { SupabasePrivateStorageAdapter, uploadAndVerifyPrivateUpload } from "../lib/cypher-batch-c.js";

const status = JSON.parse(execSync("npx supabase status", { encoding: "utf8" }).split(/\r?\n/).find(x => x.trim().startsWith("{")));
const origin = "http://127.0.0.1:54321", apikey = status.ANON_KEY, service = status.SERVICE_ROLE_KEY;
const json = async (url, init = {}) => { const r = await fetch(url, init); const body = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(body)}`); return body; };
const authHeaders = token => ({ apikey, authorization: `Bearer ${token}`, "content-type": "application/json" });
const suffix = crypto.randomUUID(), email = `storage-${suffix}@example.test`, password = `T3st-${suffix}!`;
const signup = await json(`${origin}/auth/v1/signup`, { method: "POST", headers: authHeaders(apikey), body: JSON.stringify({ email, password }) });
const userId = signup.user.id, token = signup.access_token, tenantId = crypto.randomUUID();
execSync(`docker exec supabase_db_shikigami-cypher-online psql -U postgres -v ON_ERROR_STOP=1 -c "insert into public.cypher_tenants(id,legacy_id,name) values ('${tenantId}','storage-${suffix}','Storage integration'); insert into public.cypher_memberships(tenant_id,user_id,role,status) values ('${tenantId}','${userId}','owner','active');"`, { stdio: "ignore" });
const bytes = new TextEncoder().encode(`exact-private-bytes:${suffix}`), hash = crypto.createHash("sha256").update(bytes).digest("hex");
const intentResult = await json(`${origin}/rest/v1/rpc/cypher_create_upload_intent`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ target_tenant: tenantId, target_location: null, target_filename: "exact.txt", target_document_type: "other", requested_size: bytes.length, request_key: `storage-${suffix}` }) });
const intentId = intentResult.id, objectPath = `${tenantId}/${intentId}/original/${hash}.txt`;
const adapter = new SupabasePrivateStorageAdapter({ origin, bucket: "cypher-documents", token, apikey, contentType: "text/plain" });
for (const invalidPath of [`${tenantId}/${intentId}/alternate/${hash}.txt`,`${tenantId}/${intentId}/original/${hash}.txt.extra`,`${tenantId}/${intentId}/original/${hash.toUpperCase()}.txt`]) {
  let denied = false; try { await adapter.upload(invalidPath, bytes); } catch { denied = true; }
  const slash = invalidPath.lastIndexOf("/"), listed = await json(`${origin}/storage/v1/object/list/cypher-documents`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ prefix: invalidPath.slice(0, slash), search: invalidPath.slice(slash + 1), limit: 10 }) });
  if (!denied || listed.some(x => x.name === invalidPath.slice(slash + 1))) throw new Error(`noncanonical Storage path accepted: ${invalidPath}`);
}
let finalized;
await uploadAndVerifyPrivateUpload({ intent: { id: intentId, tenant_id: tenantId, state: "awaiting_upload", requested_size: bytes.length, object_path: objectPath }, bytes, store: adapter, db: { atomicFinalize: async observation => { finalized = observation; return observation; } } });
if (finalized.content_hash !== hash || finalized.size_bytes !== bytes.length || finalized.object_path !== objectPath) throw new Error("verified observation mismatch");
const documentId = crypto.randomUUID(), version = finalized.storage_version.replaceAll("'", "''");
const committed = execSync(`docker exec supabase_db_shikigami-cypher-online psql -U postgres -At -v ON_ERROR_STOP=1 -c "set role service_role; select set_config('request.jwt.claims','{\\"role\\":\\"service_role\\"}',false); select private.cypher_commit_verified_upload('${tenantId}','${intentId}','${documentId}','${objectPath}','${hash}',${bytes.length},'${version}'); reset role; select (select count(*) from public.cypher_trusted_upload_receipts where document_id='${documentId}')||':'||(select count(*) from public.cypher_documents where id='${documentId}')||':'||(select count(*) from public.cypher_intake_events where document_id='${documentId}')||':'||(select count(*) from public.cypher_outbox where aggregate_id='${documentId}');"`, { encoding: "utf8" });
if (!committed.includes("1:1:1:1")) throw new Error(`atomic commit verification failed: ${committed}`);
const unauthenticated = await fetch(adapter.url(objectPath), { headers: { apikey } });
if (unauthenticated.ok) throw new Error("private object was anonymously readable");
console.log(JSON.stringify({ status: "PASS", intentId, documentId, objectPath, sha256: hash, size: bytes.length, atomic: "receipt+document+audit+outbox", anonymousStatus: unauthenticated.status }));
