import {createHash} from "node:crypto";
const JSON_HEADERS = { "content-type": "application/json;charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const ACCESS_COOKIE = "cypher_sb_access";
const REFRESH_COOKIE = "cypher_sb_refresh";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const ROUTES = new Map([
  ["/api/cypher/v1/companies", ["GET"]], ["/api/cypher/v1/login", ["POST"]], ["/api/cypher/v1/signup", ["POST"]], ["/api/cypher/v1/logout", ["POST"]],
  ["/api/cypher/v1/session", ["GET"]], ["/api/cypher/v1/documents", ["GET", "POST"]],
  ["/api/cypher/v1/relationships", ["GET"]], ["/api/cypher/v1/relationships/decision", ["POST"]],
  ["/api/cypher/v1/exceptions", ["GET"]], ["/api/cypher/v1/exceptions/transition", ["POST"]],
  ["/api/cypher/v1/obligations", ["GET"]], ["/api/cypher/v1/obligations/transition", ["POST"]],
  ["/api/cypher/v1/evidence", ["GET"]], ["/api/cypher/v1/exports", ["POST"]],
  ["/api/cypher/v1/deliveries", ["GET", "POST"]], ["/api/cypher/v1/overview", ["GET"]],
  ["/api/cypher/v1/stores", ["GET"]], ["/api/cypher/v1/vendors", ["GET"]], ["/api/cypher/v1/exposure", ["GET"]],
  ["/api/cypher/v1/reports/documents.csv", ["GET"]],
]);
const DOCUMENT_ROUTE = new RegExp(`^/api/cypher/v1/documents/(${UUID})(?:/(validate|reprocess|original|validation-pdf|evidence-manifest))?$`, "i");
const ARTIFACT_ROUTE = new RegExp(`^/api/cypher/v1/artifacts/(${UUID})$`, "i");

function parseRoute(path) {
  const methods = ROUTES.get(path);
  if (methods) return { methods };
  const match = DOCUMENT_ROUTE.exec(path);
  if (!match) { const artifact=ARTIFACT_ROUTE.exec(path); return artifact?{methods:["GET"],artifactId:artifact[1]}:null; }
  const action = match[2] || "detail";
  return { methods: [action === "detail" || ["original", "validation-pdf", "evidence-manifest"].includes(action) ? "GET" : "POST"], documentId: match[1], action };
}

function reply(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function cookie(request, name) {
  const match = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}
function configured(env) {
  return env.CYPHER_SUPABASE_ENABLED === "true" && Boolean(supabaseOrigin(env) && env.SUPABASE_PUBLISHABLE_KEY);
}
function cleanOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url;
  } catch { return null; }
}
export function supabaseOrigin(env) {
  const candidate = cleanOrigin(env.SUPABASE_URL);
  if (!candidate) return null;
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(candidate.hostname);
  if (loopback) {
    const allowedPort = String(env.SUPABASE_LOCAL_PORT || "54321");
    return ["http:", "https:"].includes(candidate.protocol) && candidate.port === allowedPort ? candidate.origin : null;
  }
  const allowed = cleanOrigin(env.SUPABASE_PROJECT_ORIGIN);
  if (!allowed || allowed.protocol !== "https:" || allowed.port || candidate.protocol !== "https:" || candidate.port) return null;
  return candidate.origin === allowed.origin ? candidate.origin : null;
}
function base(env, path) { return `${supabaseOrigin(env)}${path}`; }
function authHeaders(env, token, extra = {}) {
  return { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}`, ...extra };
}
async function boundedJson(response, limit = 1024 * 1024) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) throw new Error("Supabase response exceeded the bounded adapter limit.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > limit) throw new Error("Supabase response exceeded the bounded adapter limit.");
  return bytes.byteLength ? JSON.parse(new TextDecoder().decode(bytes)) : null;
}
async function supabase(env, token, path, init = {}) {
  const response = await fetch(base(env, path), { ...init, redirect: "manual", headers: authHeaders(env, token, { accept: "application/json", ...(init.headers || {}) }), signal: AbortSignal.timeout(10000) });
  if (response.status >= 300 && response.status < 400) return { error: reply({ message: "Supabase redirects are prohibited." }, 502), data: null };
  const data = await boundedJson(response);
  if (!response.ok) return { error: reply({ message: data?.message || data?.error_description || data?.hint || "Supabase request failed." }, response.status), data: null };
  return { data, response };
}
async function principal(request, env) {
  const token = cookie(request, ACCESS_COOKIE) || (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const user = await supabase(env, token, "/auth/v1/user");
  if (user.error) return null;
  const memberships = await supabase(env, token, `/rest/v1/cypher_memberships?select=tenant_id,role,status,cypher_tenants(name)&user_id=eq.${encodeURIComponent(user.data.id)}&status=eq.active&order=tenant_id.asc&limit=100`);
  if (memberships.error || !memberships.data?.length) return null;
  const requested = request.headers.get("x-cypher-tenant-id");
  if (requested && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requested)) return { error: reply({ message: "X-Cypher-Tenant-ID must be a valid tenant UUID." }, 400) };
  if (!requested && memberships.data.length !== 1) return { error: reply({ message: "Explicit tenant selection is required for multi-tenant accounts." }, 409) };
  const membership = requested ? memberships.data.find((item) => item.tenant_id === requested) : memberships.data[0];
  if (!membership) return { error: reply({ message: "Selected tenant membership is not active." }, 403) };
  return { token, user: user.data, membership };
}
function clearCookies() {
  return `${ACCESS_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0, ${REFRESH_COOKIE}=; Path=/api/cypher/v1; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
async function readJson(request, max = 65536) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > max) throw new Error("Request body is too large.");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > max) throw new Error("Request body is too large.");
  return bytes.byteLength ? JSON.parse(new TextDecoder().decode(bytes)) : {};
}
async function list(env, p, table, select = "*", query = "") {
  return supabase(env, p.token, `/rest/v1/${table}?select=${encodeURIComponent(select)}${query}`);
}
async function rpc(env, p, name, body) {
  return supabase(env, p.token, `/rest/v1/rpc/${name}`, { method: "POST", headers: { "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(body) });
}
function verifierPrerequisiteError(env) {
  const maximum=Number(env.CYPHER_MAX_UPLOAD_BYTES||15728640);
  return typeof env.SUPABASE_SERVICE_ROLE_KEY!=="string"||env.SUPABASE_SERVICE_ROLE_KEY.length<20||!Number.isSafeInteger(maximum)||maximum<1?reply({message:"Server-side Storage verification is not configured."},503):null;
}
async function recordVerificationFailure(env, observation, reason, deletion, head) {
  const secret=env.SUPABASE_SERVICE_ROLE_KEY,response=await fetch(base(env,"/rest/v1/cypher_storage_verification_failures"),{method:"POST",headers:{apikey:secret,authorization:`Bearer ${secret}`,"content-type":"application/json",prefer:"return=minimal"},body:JSON.stringify({tenant_id:observation.tenant,upload_intent_id:observation.intent,object_path:observation.path,reason,cleanup_delete_status:deletion,cleanup_head_status:head,details:{cleanup_verified:false}}),signal:AbortSignal.timeout(10000)});
  return response.ok;
}
async function discardUnverifiedUpload(env, observation, reason) {
  const secret=env.SUPABASE_SERVICE_ROLE_KEY,headers={apikey:secret,authorization:`Bearer ${secret}`};let deletion=0,head=0;
  try{const removed=await fetch(base(env,`/storage/v1/object/cypher-documents/${observation.path}`),{method:"DELETE",headers,redirect:"manual",signal:AbortSignal.timeout(10000)});deletion=removed.status;const absent=await fetch(base(env,`/storage/v1/object/authenticated/cypher-documents/${observation.path}`),{method:"HEAD",headers,redirect:"manual",signal:AbortSignal.timeout(10000)});head=absent.status;if(removed.ok&&absent.status===404)return {verified:true,delete_status:deletion,head_status:head};}catch{}
  const recorded=await recordVerificationFailure(env,observation,reason,deletion,head).catch(()=>false);return {verified:false,delete_status:deletion,head_status:head,quarantine_recorded:recorded};
}
async function verifyAndCommitUpload(env, observation) {
  const secret=env.SUPABASE_SERVICE_ROLE_KEY;
  const prerequisite=verifierPrerequisiteError(env);if(prerequisite)return {error:prerequisite,reason:"verifier_prerequisite_missing"};
  const storagePath=base(env, `/storage/v1/object/authenticated/cypher-documents/${observation.path}`),headers={apikey:secret,authorization:`Bearer ${secret}`};
  const timeout=Number(env.CYPHER_STORAGE_VERIFY_TIMEOUT_MS||10000),controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error("storage verification timeout")),timeout);let head1;
  try{head1=await fetch(storagePath,{method:"HEAD",headers,redirect:"manual",signal:controller.signal});}catch{return {error:reply({message:"Stored upload verification timed out."},504),reason:"head_timeout"}}finally{clearTimeout(timer)}
  if(!head1.ok||head1.status>=300&&head1.status<400)return {error:reply({message:"Stored upload could not be verified."},424),reason:"missing_object"};
  const version=head1.headers.get("etag"),size1=Number(head1.headers.get("content-length"));
  if(!version||!Number.isSafeInteger(size1)||size1!==observation.size)return {error:reply({message:"Stored upload metadata did not match the request."},424),reason:"metadata_mismatch"};
  const streamController=new AbortController(),streamTimer=setTimeout(()=>streamController.abort(new Error("storage stream timeout")),timeout);let streamed,reader,total=0,storedHash;
  try{streamed=await fetch(storagePath,{headers,redirect:"manual",signal:streamController.signal});if(!streamed.ok||!streamed.body)throw new Error("missing_body");reader=streamed.body.getReader();const digest=createHash("sha256"),maximum=Number(env.CYPHER_MAX_UPLOAD_BYTES||15728640);for(;;){let chunkTimer;const chunkTimeout=new Promise((_,reject)=>{chunkTimer=setTimeout(()=>{const error=new Error("stream_timeout");error.name="AbortError";reject(error)},timeout)});const {done,value}=await Promise.race([reader.read(),chunkTimeout]);clearTimeout(chunkTimer);if(done)break;if(!(value instanceof Uint8Array))throw new Error("invalid_chunk");total+=value.byteLength;if(total>maximum||total>observation.size)throw new Error("overflow");digest.update(value)}storedHash=digest.digest("hex");}catch(error){return {error:reply({message:error?.name==="AbortError"?"Stored upload verification timed out.":"Stored upload stream failed bounded verification."},error?.name==="AbortError"?504:424),reason:error?.name==="AbortError"?"stream_timeout":String(error?.message||"stream_failure")}}finally{clearTimeout(streamTimer);streamController.abort();try{await reader?.cancel()}catch{}}
  if(total!==observation.size)return {error:reply({message:"Stored upload stream was truncated."},424),reason:"truncation"};
  if(storedHash!==observation.hash)return {error:reply({message:"Stored upload hash did not match the Worker observation."},424),reason:"hash_mismatch"};
  const head2=await fetch(storagePath,{method:"HEAD",headers,redirect:"manual",signal:AbortSignal.timeout(10000)}),version2=head2.headers.get("etag"),size2=Number(head2.headers.get("content-length"));
  if(!head2.ok||version2!==version||size2!==size1)return {error:reply({message:"Stored upload changed during verification."},409),reason:"toctou_mutation"};
  const response=await fetch(base(env,"/rest/v1/rpc/cypher_commit_verified_upload"),{method:"POST",redirect:"manual",headers:{apikey:secret,authorization:`Bearer ${secret}`,"content-type":"application/json",prefer:"return=representation"},body:JSON.stringify({target_tenant:observation.tenant,target_intent:observation.intent,target_document:observation.document,target_path:observation.path,target_hash:storedHash,target_size:total,target_storage_version:version}),signal:AbortSignal.timeout(10000)});
  const data=await boundedJson(response);
  if(!response.ok)return {error:reply({message:data?.message||"Verified upload commit failed."},response.status),reason:"commit_failure"};
  return {data};
}

export async function handleCypherSupabaseRoute(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const route = parseRoute(path);
  if (!route) return reply({ message: "Route is not available under the Supabase authority contract." }, 404);
  if (!route.methods.includes(method)) return reply({ message: "Method not allowed." }, 405, { allow: route.methods.join(", ") });
  if (!configured(env)) return reply({ message: "Cypher Supabase authority is not configured; legacy mutations are disabled." }, 503);
  if (path === "/api/cypher/v1/companies" && method === "GET") return reply({companies:[{slug:"advance-auto-parts-synthetic-pilot",display_name:"Advance Auto Parts — Synthetic Pilot",classification:"synthetic_pilot"}]});
  if (path === "/api/cypher/v1/signup" && method === "POST") {
    const body=await readJson(request),company=String(body.company||""),email=String(body.email||"").trim().toLowerCase(),password=String(body.password||"");
    if(company!=="advance-auto-parts-synthetic-pilot"||email.length>254||password.length<12||password.length>128)return reply({message:"Unable to create pilot access with the supplied details."},400);
    const origin=new URL(request.url).origin,allowed=new Set(["https://cypher-staging.shikigamitechnologies.com","https://shikigamitechnologies.com","http://127.0.0.1:8787"]);
    if(!allowed.has(origin))return reply({message:"Enrollment origin is not authorized."},403);
    const redirect=`${origin}/cypher-sign-in.html?confirmed=1&company=${encodeURIComponent(company)}`;
    const response=await fetch(base(env,`/auth/v1/signup?redirect_to=${encodeURIComponent(redirect)}`),{method:"POST",redirect:"manual",headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,"content-type":"application/json"},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(10000)});
    if(response.status>=300&&response.status<400)return reply({message:"Supabase redirects are prohibited."},502);
    await boundedJson(response).catch(()=>null);
    return reply({message:"If the address is eligible, Supabase has sent a confirmation email. Confirm it, then sign in to activate the synthetic pilot workspace."},202);
  }
  if (path === "/api/cypher/v1/login" && method === "POST") {
    const body = await readJson(request), response = await fetch(base(env, "/auth/v1/token?grant_type=password"), { method: "POST", redirect: "manual", headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" }, body: JSON.stringify({ email: body.email, password: body.password }), signal: AbortSignal.timeout(10000) });
    if (response.status >= 300 && response.status < 400) return reply({ message: "Supabase redirects are prohibited." }, 502);
    const data = await boundedJson(response);
    if (!response.ok) return reply({ message: "Invalid email or password." }, 401);
    const company=String(body.company||"");
    const claim=await fetch(base(env,"/rest/v1/rpc/cypher_claim_pilot_membership"),{method:"POST",redirect:"manual",headers:authHeaders(env,data.access_token,{"content-type":"application/json"}),body:JSON.stringify({company_slug:company}),signal:AbortSignal.timeout(10000)});
    if(!claim.ok)return reply({message:"Your email must be confirmed and authorized for this company workspace."},403);
    const membership=await fetch(base(env,`/rest/v1/cypher_memberships?select=tenant_id,cypher_tenants!inner(slug)&user_id=eq.${encodeURIComponent(data.user.id)}&status=eq.active&cypher_tenants.slug=eq.${encodeURIComponent(company)}&limit=1`),{headers:authHeaders(env,data.access_token),signal:AbortSignal.timeout(10000)});
    const rows=await boundedJson(membership).catch(()=>[]);
    if(!membership.ok||!rows?.length)return reply({message:"Your email must be confirmed and authorized for this company workspace."},403);
    return reply({ ok: true }, 200, { "set-cookie": `${ACCESS_COOKIE}=${encodeURIComponent(data.access_token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${data.expires_in}, ${REFRESH_COOKIE}=${encodeURIComponent(data.refresh_token)}; Path=/api/cypher/v1; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000` });
  }
  if (path === "/api/cypher/v1/logout" && method === "POST") return reply({ ok: true }, 200, { "set-cookie": clearCookies() });
  const p = await principal(request, env);
  if (!p) return reply({ message: "Authentication required." }, 401);
  if (p.error) return p.error;
  const tenantId = p.membership.tenant_id;
  if (route.artifactId) { const a=await list(env,p,"cypher_artifacts","id,object_path,content_hash,size_bytes,artifact_type",`&id=eq.${route.artifactId}&limit=1`);if(a.error||!a.data?.length)return a.error||reply({message:"Artifact not found."},404);const item=a.data[0],r=await fetch(base(env,`/storage/v1/object/authenticated/cypher-documents/${item.object_path}`),{headers:authHeaders(env,p.token),signal:AbortSignal.timeout(10000)});if(!r.ok)return reply({message:"Artifact retrieval failed."},r.status);const bytes=new Uint8Array(await r.arrayBuffer()),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");if(bytes.length!==item.size_bytes||hash!==item.content_hash)return reply({message:"Artifact integrity failure."},424);return new Response(bytes,{headers:{"content-type":"application/octet-stream","x-content-sha256":hash,"content-disposition":`attachment; filename="${item.artifact_type}"`}}); }
  if (path === "/api/cypher/v1/session" && method === "GET") return reply({ account: { id: p.user.id, email: p.user.email, display_name: p.user.email, company: p.membership.cypher_tenants?.name || "Cypher", role: p.membership.role, plan: "controlled_pilot", subscription_status: "active", must_change_password: false } });
  if (path === "/api/cypher/v1/documents" && method === "POST") {
    const prerequisite=verifierPrerequisiteError(env);if(prerequisite)return prerequisite;const size = Number(request.headers.get("content-length") || 0), filename = (request.headers.get("x-cypher-filename") || "document.pdf").slice(0, 240), type = request.headers.get("x-cypher-document-type") || "other", key = request.headers.get("idempotency-key") || request.headers.get("x-idempotency-key");
    if (!key || !/^[A-Za-z0-9._:-]{8,200}$/.test(key)) return reply({ message: "A valid Idempotency-Key is required." }, 400);
    if (!size || size > Number(env.CYPHER_MAX_UPLOAD_BYTES || 15728640)) return reply({ message: "A bounded non-empty upload is required." }, 413);
    const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length!==size)return reply({message:"Upload size changed in transit."},400);const result = await rpc(env, p, "cypher_create_upload_intent", { target_tenant: tenantId, target_location: request.headers.get("x-cypher-location-id") || null, target_filename: filename, target_document_type: type, requested_size: size, request_key: key });if(result.error)return result.error;const intent=Array.isArray(result.data)?result.data[0]:result.data,hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join(""),ext=(filename.split(".").pop()||"pdf").toLowerCase().replace(/[^a-z0-9]/g,"")||"pdf",objectPath=`${tenantId}/${intent.id}/original/${hash}.${ext}`,upload=await fetch(base(env,`/storage/v1/object/cypher-documents/${objectPath}`),{method:"POST",headers:authHeaders(env,p.token,{"content-type":request.headers.get("content-type")||"application/pdf","x-upsert":"false"}),body:bytes,signal:AbortSignal.timeout(10000)});if(!upload.ok)return reply({message:"Private Storage upload failed."},upload.status);const document=crypto.randomUUID(),observation={tenant:tenantId,intent:intent.id,document,path:objectPath,hash,size},commit=await verifyAndCommitUpload(env,observation);if(commit.error){const cleanup=await discardUnverifiedUpload(env,observation,commit.reason);if(!cleanup.verified)return reply({message:"Upload verification failed and object cleanup could not be proven; the object is quarantined.",quarantine_recorded:cleanup.quarantine_recorded===true},503);return commit.error}return reply({upload_intent:intent,document_id:document,object_path:objectPath,sha256:hash,state:"finalized",queued:true},201);
  }
  const documentId = route.documentId;
  if (route.action === "validate") { const b = await readJson(request);const r = await rpc(env, p, "cypher_validate_document", { target_document: documentId, decision: b.decision, notes: b.notes || null, corrected_fields: b.fields || {} }); return r.error || reply({ status:r.data }); }
  if (route.action === "reprocess") { const r = await rpc(env, p, "cypher_enqueue_document", { target_document: documentId, request_key: request.headers.get("idempotency-key") || crypto.randomUUID() }); return r.error || reply({ job: r.data }, 202); }
  if (["original", "validation-pdf", "evidence-manifest"].includes(route.action)) {
    const type=route.action==="validation-pdf"?"validation_pdf":route.action==="evidence-manifest"?"evidence_manifest":"original";
    const a=await list(env,p,"cypher_artifacts","id,object_path,content_hash,size_bytes,artifact_type",`&document_id=eq.${documentId}&artifact_type=eq.${type}&order=created_at.desc&limit=1`);
    if(a.error||!a.data?.length)return a.error||reply({message:"Verified artifact not found."},404);
    const item=a.data[0],r=await fetch(base(env,`/storage/v1/object/authenticated/cypher-documents/${item.object_path}`),{headers:authHeaders(env,p.token),signal:AbortSignal.timeout(10000)});
    if(!r.ok)return reply({message:"Artifact retrieval failed."},r.status);
    const bytes=new Uint8Array(await r.arrayBuffer()),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");
    if(bytes.length!==item.size_bytes||hash!==item.content_hash)return reply({message:"Artifact integrity failure."},424);
    const contentType=type==="validation_pdf"?"application/pdf":type==="evidence_manifest"?"application/json":"application/octet-stream";
    return new Response(bytes,{headers:{"content-type":contentType,"cache-control":"private,no-store","x-content-sha256":hash,"content-disposition":`attachment; filename="${type}"`}});
  }
  if (route.action === "detail") { const r = await rpc(env, p, "cypher_document_detail", { target_document: documentId }); return r.error || reply(r.data); }
  const query = url.searchParams.get("status") ? `&status=eq.${encodeURIComponent(url.searchParams.get("status"))}` : "";
  if (path === "/api/cypher/v1/documents" && method === "GET") { const r = await list(env, p, "cypher_documents", "*", `${query}&order=created_at.desc&limit=100`); return r.error || reply({ documents: r.data }); }
  if (path === "/api/cypher/v1/relationships" && method === "GET") { const r = await list(env, p, "cypher_relationships", "*"); return r.error || reply({ relationships: r.data }); }
  if (path === "/api/cypher/v1/relationships/decision" && method === "POST") { const b = await readJson(request); const r = await rpc(env, p, "cypher_transition_relationship", { target: b.relationship_id, decision: b.decision, reason: b.reason }); return r.error || reply({ relationship: r.data }); }
  if (path === "/api/cypher/v1/exceptions" && method === "GET") { const r = await list(env, p, "cypher_exceptions", "*"); return r.error || reply({ exceptions: r.data }); }
  if (path === "/api/cypher/v1/exceptions/transition" && method === "POST") { const b = await readJson(request); const r = await rpc(env, p, "cypher_transition_exception", { target: b.exception_id, next_state: b.status, reason: b.reason, assignee: b.assigned_to || null }); return r.error || reply({ exception: r.data }); }
  if (path === "/api/cypher/v1/obligations" && method === "GET") { const r = await list(env, p, "cypher_obligations", "*"); return r.error || reply({ obligations: r.data }); }
  if (path === "/api/cypher/v1/obligations/transition" && method === "POST") { const b = await readJson(request); const r = await rpc(env, p, "cypher_transition_obligation", { target: b.obligation_id, next_state: b.state, reason: b.reason }); return r.error || reply({ obligation: r.data }); }
  if (path === "/api/cypher/v1/evidence" && method === "GET") { const r = await list(env, p, "cypher_evidence_packages", "*"); return r.error || reply({ packages: r.data }); }
  if (path === "/api/cypher/v1/exports" && method === "POST") { const b=await readJson(request),key=request.headers.get("idempotency-key")||b.idempotency_key;if(b.document_id){if(!key)return reply({message:"An idempotency key is required."},400);const r=await rpc(env,p,"cypher_request_evidence",{target_document:b.document_id,request_key:key});return r.error||reply({job:r.data,status:"queued"},202);}const format=String(b.format||"xlsx").toLowerCase();if(!["csv","xlsx","json"].includes(format)||!key)return reply({message:"A supported format and idempotency key are required."},400);const r=await rpc(env,p,"cypher_request_export",{target_tenant:tenantId,export_format:format,request_key:key});return r.error||reply({job:r.data,status:"queued"},202); }
  if (path === "/api/cypher/v1/deliveries" && method === "GET") { const r = await list(env, p, "cypher_deliveries", "*"); return r.error || reply({ deliveries: r.data }); }
  if (path === "/api/cypher/v1/deliveries" && method === "POST") { const b = await readJson(request); const r = await rpc(env, p, "cypher_request_delivery", { target_connector: b.connector_id, target_package: b.evidence_package_id, request_key: b.idempotency_key }); return r.error || reply({delivery:r.data,status:"queued"}, 202); }
  if (path === "/api/cypher/v1/overview" && method === "GET") { const r = await rpc(env, p, "cypher_overview", {}); return r.error || reply(r.data); }
  if (["/api/cypher/v1/stores", "/api/cypher/v1/vendors", "/api/cypher/v1/exposure"].includes(path) && method === "GET") { const table = path.split("/").pop(); const r = await rpc(env, p, `cypher_${table}`, {}); return r.error || reply({ [table]: r.data, currency: "USD" }); }
  if (path === "/api/cypher/v1/reports/documents.csv" && method === "GET") return reply({ message: "Exports are asynchronous evidence jobs; request POST /api/cypher/v1/exports." }, 409);
  return reply({ message: "Route is not available under the Supabase authority contract." }, 404);
}
