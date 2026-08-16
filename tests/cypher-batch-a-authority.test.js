import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../worker.js";
import { handleCypherSupabaseRoute, supabaseOrigin } from "../lib/cypher-supabase-adapter.js";
import adapterSource from "../lib/cypher-supabase-adapter.js?raw";
import workerSource from "../worker.js?raw";
import configSource from "../wrangler.jsonc?raw";
import migration from "../supabase/migrations/20260816000200_cypher_batch_a_authority_route_spine.sql?raw";

const activeRuntimeModules = import.meta.glob(["../worker.js", "../lib/*.js", "../assets/js/*.js"], { query:"?raw", import:"default", eager:true });

const env = { CYPHER_SUPABASE_ENABLED:"true", SUPABASE_URL:"http://127.0.0.1:54321", SUPABASE_LOCAL_PORT:"54321", SUPABASE_PUBLISHABLE_KEY:"test", SUPABASE_SERVICE_ROLE_KEY:"server-secret-credential-123" };
const jsonResponse = (body, status=200, headers={}) => new Response(JSON.stringify(body), { status, headers:{ "content-type":"application/json", ...headers } });
function mockPrincipal(memberships, { secondEtag="trusted-storage-version", firstHeadStatus=200, firstSize=100, storedBytes=new Uint8Array(100), storedStream=null, deleteStatus=200, deleteHeadStatus=404 } = {}) {
  let storageHead=0,deleted=false;
  globalThis.fetch = vi.fn(async (url, init) => {
    if (url.endsWith("/auth/v1/user")) return jsonResponse({ id:"11111111-1111-4111-8111-111111111111", email:"a@example.test" });
    if (url.includes("cypher_memberships")) return jsonResponse(memberships);
    if (url.includes("/rpc/cypher_create_upload_intent")) return jsonResponse({ id:"intent-1", state:"awaiting_upload" });
    if (url.includes("/storage/v1/object/authenticated/cypher-documents/") && init?.method === "HEAD") { if(deleted)return new Response(null,{status:deleteHeadStatus});storageHead++; return new Response(null, { status:storageHead===1?firstHeadStatus:200, headers:{ etag:storageHead===1?"trusted-storage-version":secondEtag,"content-length":String(storageHead===1?firstSize:100) } }); }
    if (url.includes("/storage/v1/object/authenticated/cypher-documents/")) return new Response(storedStream||storedBytes, { status:200, headers:{ etag:"trusted-storage-version","content-length":String(storedBytes.length) } });
    if (url.includes("/storage/v1/object/cypher-documents/") && init?.method === "DELETE") {deleted=deleteStatus>=200&&deleteStatus<300;return new Response(null,{status:deleteStatus});}
    if (url.includes("/storage/v1/object/cypher-documents/")) return new Response(null, { status:200, headers:{ etag:"untrusted-upload-response" } });
    if (url.includes("/rpc/cypher_commit_verified_upload")) return jsonResponse({ status:"finalized" });
    if (url.includes("/rest/v1/cypher_storage_verification_failures")) return new Response(null,{status:201});
    throw new Error(`unexpected fetch ${url} ${init?.method}`);
  });
}
afterEach(() => vi.restoreAllMocks());

describe("Batch A repaired authority boundaries", () => {
  it("fails closed before touching removed legacy bindings", async () => {
    const poison = new Proxy({}, { get(){ throw new Error("legacy binding touched"); } });
    const response = await worker.fetch(new Request("https://example.test/api/cypher/v1/documents"), { CYPHER:poison, CYPHER_FILES:poison, CYPHER_JOBS:poison, CYPHER_SUPABASE_ENABLED:"false" });
    expect(response.status).toBe(503);
  });

  it("removes the legacy queue consumer and all Cypher bindings", () => {
    const config = JSON.parse(configSource);
    expect(config.d1_databases.map(x=>x.binding)).not.toContain("CYPHER");
    expect(config).not.toHaveProperty("r2_buckets");
    expect(config).not.toHaveProperty("queues");
    expect(worker).not.toHaveProperty("queue");
    expect(workerSource).not.toContain("legacy_cypher_queue_disabled");
  });

  it("statically excludes legacy Cypher persistence and mutation APIs from every active runtime JavaScript file", () => {
    const activeSource = Object.values(activeRuntimeModules).join("\n");
    for (const forbidden of [/env\.CYPHER\b/, /CYPHER_FILES\b/, /CYPHER_JOBS\b/, /\.batch\s*\(/, /\b(?:R2|bucket)\w*\.put\s*\(/i, /\b(?:R2|bucket)\w*\.delete\s*\(/i, /\b(?:queue|jobs)\w*\.send\s*\(/i]) expect(activeSource).not.toMatch(forbidden);
  });

  it("fails malformed document routes closed before authentication or RPC dispatch", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("route must not call Supabase"); });
    const badPaths = [
      "/api/cypher/v1/documents/not-a-uuid", "/api/cypher/v1/documents/11111111-1111-1111-1111-111111111111",
      "/api/cypher/v1/documents/11111111-1111-4111-8111-111111111111junk", "/api/cypher/v1/documents/11111111-1111-4111-8111-111111111111/extra",
      "/api/cypher/v1/documents/11111111-1111-4111-8111-111111111111/validate/extra", "/api/cypher/v1/documents%2F11111111-1111-4111-8111-111111111111",
      "/api/cypher/v1/documents/%2e%2e%2fsession", "/api/cypher/v1/documents/%252e%252e/session", "/api/cypher/v1/documents/11111111-1111-4111-8111-111111111111%2Foriginal",
    ];
    for (const path of badPaths) expect((await handleCypherSupabaseRoute(new Request(`https://app.test${path}`, { headers:{ authorization:"Bearer x" } }), env)).status).toBe(404);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("enforces exact per-route method matrices before authentication or RPC dispatch", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("method rejection must not call Supabase"); });
    const id = "11111111-1111-4111-8111-111111111111";
    for (const [path, method, allow] of [[`/api/cypher/v1/documents/${id}`,"POST","GET"],[`/api/cypher/v1/documents/${id}/validate`,"GET","POST"],["/api/cypher/v1/documents","DELETE","GET, POST"],["/api/cypher/v1/session","PATCH","GET"]]) {
      const response = await handleCypherSupabaseRoute(new Request(`https://app.test${path}`, { method, headers:{ authorization:"Bearer x" } }), env);
      expect(response.status).toBe(405); expect(response.headers.get("allow")).toBe(allow);
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("strictly allowlists only the configured HTTPS origin or expected local loopback port", () => {
    expect(supabaseOrigin(env)).toBe("http://127.0.0.1:54321");
    expect(supabaseOrigin({ SUPABASE_URL:"https://abc.supabase.co", SUPABASE_PROJECT_ORIGIN:"https://abc.supabase.co" })).toBe("https://abc.supabase.co");
    for (const bad of ["http://abc.supabase.co","https://u:p@abc.supabase.co","https://abc.supabase.co/path","https://abc.supabase.co/#x","https://evil.example","http://127.0.0.1:8000"])
      expect(supabaseOrigin({ ...env, SUPABASE_URL:bad, SUPABASE_PROJECT_ORIGIN:"https://abc.supabase.co" })).toBeNull();
  });

  it("rejects redirects from the configured origin", async () => {
    globalThis.fetch = vi.fn(async () => new Response(null,{status:302,headers:{location:"https://evil.example"}}));
    const response = await handleCypherSupabaseRoute(new Request("https://app.test/api/cypher/v1/session",{headers:{authorization:"Bearer x"}}),env);
    expect(response.status).toBe(401);
    expect(globalThis.fetch.mock.calls[0][1].redirect).toBe("manual");
  });

  it("requires explicit tenant selection when active membership is ambiguous", async () => {
    mockPrincipal([{tenant_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",role:"owner",status:"active"},{tenant_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",role:"owner",status:"active"}]);
    const response = await handleCypherSupabaseRoute(new Request("https://app.test/api/cypher/v1/session",{headers:{authorization:"Bearer x"}}),env);
    expect(response.status).toBe(409);
  });

  it("rejects cross-tenant and inactive tenant selection", async () => {
    mockPrincipal([{tenant_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",role:"owner",status:"active"}]);
    const response = await handleCypherSupabaseRoute(new Request("https://app.test/api/cypher/v1/session",{headers:{authorization:"Bearer x","x-cypher-tenant-id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}}),env);
    expect(response.status).toBe(403);
    expect(globalThis.fetch.mock.calls[1][0]).toContain("status=eq.active");
  });

  it("creates an intent, uploads the request bytes, and atomically finalizes without trusting caller metadata", async () => {
    mockPrincipal([{tenant_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",role:"owner",status:"active"}]);
    const request = new Request("https://app.test/api/cypher/v1/documents",{method:"POST",headers:{authorization:"Bearer x","content-length":"100","idempotency-key":"upload-key-1","x-content-sha256":"f".repeat(64),"x-object-path":"forged/path","x-cypher-filename":"x.pdf"},body:new Uint8Array(100)});
    const response = await handleCypherSupabaseRoute(request,env), body=await response.json();
    expect(response.status).toBe(201);
    expect(body).toMatchObject({state:"finalized",queued:true,object_path:expect.stringContaining("/intent-1/original/")});
    const rpcBody=JSON.parse(globalThis.fetch.mock.calls[2][1].body);
    expect(rpcBody).not.toHaveProperty("target_hash"); expect(rpcBody).not.toHaveProperty("target_object_path");
    expect(globalThis.fetch.mock.calls[3][1].body).toBeInstanceOf(Uint8Array);
    const finalizeBody=JSON.parse(globalThis.fetch.mock.calls[7][1].body);
    expect(finalizeBody).toMatchObject({target_intent:"intent-1",target_size:100,target_storage_version:"trusted-storage-version"});
    expect(finalizeBody.target_path).not.toBe("forged/path"); expect(finalizeBody.target_hash).not.toBe("f".repeat(64));
    expect(globalThis.fetch.mock.calls[7][1].headers.authorization).toBe("Bearer server-secret-credential-123");
  });

  it("rejects a TOCTOU version change and never calls the commit RPC", async () => {
    mockPrincipal([{tenant_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",role:"owner",status:"active"}],{secondEtag:"mutated-version"});
    const response=await handleCypherSupabaseRoute(new Request("https://app.test/api/cypher/v1/documents",{method:"POST",headers:{authorization:"Bearer x","content-length":"100","idempotency-key":"upload-key-2","x-cypher-filename":"x.pdf"},body:new Uint8Array(100)}),env);
    expect(response.status).toBe(409);
    expect(globalThis.fetch.mock.calls.some(([url])=>url.includes("/rpc/cypher_commit_verified_upload"))).toBe(false);
    expect(globalThis.fetch.mock.calls.some(([url,init])=>url.includes("/storage/v1/object/cypher-documents/")&&init.method==="DELETE")).toBe(true);
  });

  it.each([
    ["missing stored bytes",{firstHeadStatus:404},424],
    ["mismatched stored size",{firstSize:99},424],
    ["mismatched streamed hash",{storedBytes:new Uint8Array(100).fill(1)},424],
  ])("rejects %s before server commit",async(_label,verification,status)=>{
    mockPrincipal([{tenant_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",role:"owner",status:"active"}],verification);
    const response=await handleCypherSupabaseRoute(new Request("https://app.test/api/cypher/v1/documents",{method:"POST",headers:{authorization:"Bearer x","content-length":"100","idempotency-key":"upload-key-3","x-cypher-filename":"x.pdf"},body:new Uint8Array(100)}),env);
    expect(response.status).toBe(status);
    expect(globalThis.fetch.mock.calls.some(([url])=>url.includes("/rpc/cypher_commit_verified_upload"))).toBe(false);
  });

  it("rejects verifier overflow and independently removes the object",async()=>{
    mockPrincipal([{tenant_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",role:"owner",status:"active"}],{storedBytes:new Uint8Array(101)});
    const response=await handleCypherSupabaseRoute(new Request("https://app.test/api/cypher/v1/documents",{method:"POST",headers:{authorization:"Bearer x","content-length":"100","idempotency-key":"upload-key-4","x-cypher-filename":"x.pdf"},body:new Uint8Array(100)}),env);
    expect(response.status).toBe(424);expect(globalThis.fetch.mock.calls.some(([url,init])=>url.includes("/authenticated/")&&init.method==="HEAD")).toBe(true);
  });

  it("times out a stalled ReadableStream and removes the object",async()=>{
    const stalled=new ReadableStream({start(){}});mockPrincipal([{tenant_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",role:"owner",status:"active"}],{storedStream:stalled});
    const response=await handleCypherSupabaseRoute(new Request("https://app.test/api/cypher/v1/documents",{method:"POST",headers:{authorization:"Bearer x","content-length":"100","idempotency-key":"upload-key-5","x-cypher-filename":"x.pdf"},body:new Uint8Array(100)}),{...env,CYPHER_STORAGE_VERIFY_TIMEOUT_MS:"5"});
    expect(response.status).toBe(504);
  });

  it("fails before intent or Storage mutation when the server secret is absent",async()=>{
    mockPrincipal([{tenant_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",role:"owner",status:"active"}]);const {SUPABASE_SERVICE_ROLE_KEY:_removed,...missing}=env;
    const response=await handleCypherSupabaseRoute(new Request("https://app.test/api/cypher/v1/documents",{method:"POST",headers:{authorization:"Bearer x","content-length":"100","idempotency-key":"upload-key-6","x-cypher-filename":"x.pdf"},body:new Uint8Array(100)}),missing);
    expect(response.status).toBe(503);expect(globalThis.fetch.mock.calls.some(([url])=>url.includes("cypher_create_upload_intent")||url.includes("/storage/v1/object/"))).toBe(false);
  });

  it("records quarantine and fails closed when orphan deletion cannot be proven",async()=>{
    mockPrincipal([{tenant_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",role:"owner",status:"active"}],{storedBytes:new Uint8Array(100).fill(1),deleteStatus:500,deleteHeadStatus:200});
    const response=await handleCypherSupabaseRoute(new Request("https://app.test/api/cypher/v1/documents",{method:"POST",headers:{authorization:"Bearer x","content-length":"100","idempotency-key":"upload-key-7","x-cypher-filename":"x.pdf"},body:new Uint8Array(100)}),env),body=await response.json();
    expect(response.status).toBe(503);expect(body.quarantine_recorded).toBe(true);expect(globalThis.fetch.mock.calls.some(([url])=>url.includes("cypher_storage_verification_failures"))).toBe(true);
  });

  it("makes trusted receipt finalization service-only, immutable and bound", () => {
    expect(adapterSource).toContain("cypher_create_upload_intent");
    expect(migration).toMatch(/grant insert(?:,update,delete)? on public\.cypher_trusted_upload_receipts to service_role/);
    expect(migration).toContain("revoke all on function private.cypher_finalize_verified_upload(uuid) from public,anon,authenticated");
    expect(migration).toContain("trusted upload receipts are immutable");
    expect(migration).toContain("trusted receipt size mismatch");
  });
});
