import { beforeAll, describe, expect, it, vi } from "vitest";
import { SELF, env, applyD1Migrations, createMessageBatch, createExecutionContext, getQueueResult } from "cloudflare:test";
import worker from "../worker.js";

const password = "CypherLocalTest-2026!";
let cookie;

function base64(bytes) {
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary);
}

beforeAll(async () => {
  await applyD1Migrations(env.CYPHER, env.TEST_CYPHER_MIGRATIONS);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, material, 256));
  await env.CYPHER.batch([
    env.CYPHER.prepare("INSERT INTO tenants(id,slug,display_name,status,login_enabled) VALUES('tenant-test','aap-test','AAP Test','active',1)"),
    env.CYPHER.prepare("INSERT INTO users(id,email,display_name,password_salt,password_hash,password_iterations_legacy,password_iterations,status,must_change_password) VALUES('user-test','secretary@example.test','Secretary Test',?,?,600000,100000,'active',0)").bind(base64(salt), base64(hash)),
    env.CYPHER.prepare("INSERT INTO tenant_memberships(tenant_id,user_id,role,status) VALUES('tenant-test','user-test','secretary','active')"),
    env.CYPHER.prepare("INSERT INTO tenant_subscriptions(tenant_id,plan_code,status,starts_at) VALUES('tenant-test','enterprise','active',datetime('now'))"),
    env.CYPHER.prepare("INSERT INTO tenant_settings(tenant_id) VALUES('tenant-test')"),
  ]);
});

describe.sequential("Cypher Online document boundary", () => {
  it("does not expose tenant documents without a session", async () => {
    const response = await SELF.fetch("https://cypher.test/api/cypher/v1/documents");
    expect(response.status).toBe(401);
  });

  it("authenticates the tenant secretary", async () => {
    const response = await SELF.fetch("https://cypher.test/api/cypher/v1/login", {
      method: "POST", headers: { origin: "https://cypher.test", "content-type": "application/json" },
      body: JSON.stringify({ company: "aap-test", email: "secretary@example.test", password }),
    });
    expect(response.status).toBe(200); cookie = response.headers.get("set-cookie").split(";", 1)[0];
    expect(cookie).toMatch(/^cypher_session=/);
  });

  it("rejects non-PDF content before preservation", async () => {
    const response = await SELF.fetch("https://cypher.test/api/cypher/v1/documents", {
      method: "POST", headers: { origin: "https://cypher.test", cookie, "content-type": "application/pdf", "x-cypher-filename": "bad.pdf" }, body: "not a pdf",
    });
    expect(response.status).toBe(415);
    expect(Number((await env.CYPHER.prepare("SELECT COUNT(*) total FROM documents").first()).total)).toBe(0);
  });

  it("preserves, hashes, records, and queues a PDF", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
    const response = await SELF.fetch("https://cypher.test/api/cypher/v1/documents", {
      method: "POST", headers: { origin: "https://cypher.test", cookie, "content-type": "application/pdf", "x-cypher-filename": "invoice-9761.pdf", "x-cypher-document-type": "invoice" }, body: pdf,
    });
    expect(response.status).toBe(202); const payload = await response.json();
    const document = await env.CYPHER.prepare("SELECT * FROM documents WHERE id=?").bind(payload.document.id).first();
    const artifact = await env.CYPHER.prepare("SELECT * FROM document_artifacts WHERE document_id=? AND artifact_type='original'").bind(payload.document.id).first();
    const job = await env.CYPHER.prepare("SELECT * FROM processing_jobs WHERE document_id=?").bind(payload.document.id).first();
    expect(document.status).toBe("queued"); expect(document.content_sha256).toMatch(/^[0-9a-f]{64}$/); expect(job.status).toBe("queued");
    expect((await env.CYPHER_FILES.get(artifact.object_key)).size).toBe(pdf.byteLength);
  });

  it("rejects an exact duplicate without creating a second record", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
    const response = await SELF.fetch("https://cypher.test/api/cypher/v1/documents", {
      method: "POST", headers: { origin: "https://cypher.test", cookie, "content-type": "application/pdf", "x-cypher-filename": "copy.pdf" }, body: pdf,
    });
    expect(response.status).toBe(409); expect((await response.json()).duplicate).toBe(true);
    expect(Number((await env.CYPHER.prepare("SELECT COUNT(*) total FROM documents").first()).total)).toBe(1);
  });

  it("preserves a document and records a recoverable failure when queue submission fails", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<</Type/Catalog /Marker(QUEUE-FAIL)>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
    const response = await worker.fetch(new Request("https://cypher.test/api/cypher/v1/documents", {
      method: "POST", headers: { origin: "https://cypher.test", cookie, "content-type": "application/pdf", "x-cypher-filename": "queue-failure.pdf" }, body: pdf,
    }), { ...env, CYPHER_JOBS: { send: vi.fn(async () => { throw new Error("synthetic queue outage"); }) } });
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload).toMatchObject({ recoverable: true, document: { status: "needs_review" }, job: { status: "failed" } });
    const job = await env.CYPHER.prepare("SELECT status,last_error_code FROM processing_jobs WHERE id=?").bind(payload.job.id).first();
    expect(job).toMatchObject({ status: "failed", last_error_code: "QUEUE_SEND_FAILED" });
    expect(await env.CYPHER_FILES.get((await env.CYPHER.prepare("SELECT object_key FROM document_artifacts WHERE document_id=? AND artifact_type='original'").bind(payload.document.id).first()).object_key)).toBeTruthy();
  });

  it("keeps tenant boundaries enforced by the database", async () => {
    await env.CYPHER.prepare("INSERT INTO tenants(id,slug,display_name) VALUES('tenant-other','other','Other Tenant')").run();
    await expect(env.CYPHER.prepare("INSERT INTO processing_jobs(id,tenant_id,document_id,job_type) SELECT 'bad-job','tenant-other',id,'extract' FROM documents LIMIT 1").run()).rejects.toThrow(/tenant boundary violation/);
  });

  it("does not expose another tenant's document through an authenticated route", async () => {
    await env.CYPHER.batch([
      env.CYPHER.prepare("INSERT INTO users(id,email,display_name,password_salt,password_hash,password_iterations_legacy,password_iterations,status) VALUES('user-other','other@example.test','Other User',?,?,600000,100000,'active')").bind(base64(new Uint8Array(16)), base64(new Uint8Array(32))),
      env.CYPHER.prepare("INSERT INTO tenant_memberships(tenant_id,user_id,role,status) VALUES('tenant-other','user-other','secretary','active')"),
      env.CYPHER.prepare(`INSERT INTO documents(id,tenant_id,document_type,status,original_filename,content_sha256,content_type,size_bytes,uploaded_by)
        VALUES('other-document','tenant-other','invoice','needs_review','other.pdf',?,'application/pdf',10,'user-other')`).bind("e".repeat(64)),
    ]);
    const response = await SELF.fetch("https://cypher.test/api/cypher/v1/documents/00000000-0000-0000-0000-000000000000", { headers: { cookie } });
    expect(response.status).toBe(404);
    const list = await SELF.fetch("https://cypher.test/api/cypher/v1/documents", { headers: { cookie } });
    expect((await list.json()).documents.some((item) => item.id === "other-document")).toBe(false);
  });

  it("rejects state changes that omit a trusted browser origin", async () => {
    const response = await SELF.fetch("https://cypher.test/api/cypher/v1/logout", { method: "POST", headers: { cookie } });
    expect(response.status).toBe(403);
  });

  it("preserves security headers on static assets", async () => {
    const response = await SELF.fetch("https://cypher.test/");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("fails closed for all provider APIs in public staging", async () => {
    const response = await worker.fetch(new Request("https://cypher.test/api/cypher/v1/companies"), { ...env, DEPLOYMENT_ENV: "staging" });
    expect(response.status).toBe(503);
    expect((await response.json()).message).toMatch(/disabled in public staging/i);
  });

  it("does not misreport unmatched documents as confirmed debt", async () => {
    await env.CYPHER.prepare(`INSERT INTO documents(id,tenant_id,document_type,status,original_filename,content_sha256,content_type,size_bytes,invoice_total_minor,uploaded_by)
      VALUES('unmatched-test','tenant-test','invoice','unmatched','unmatched.pdf',?,'application/pdf',10,34553,'user-test')`).bind("f".repeat(64)).run();
    let response = await SELF.fetch("https://cypher.test/api/cypher/v1/overview", { headers: { cookie } });
    let overview = (await response.json()).overview; expect(overview.unmatched).toBe(1); expect(overview.outstanding_minor).toBe(0);
    await env.CYPHER.prepare("INSERT INTO document_exposure(tenant_id,document_id,classification,amount_minor) VALUES('tenant-test','unmatched-test','confirmed_outstanding',34553)").run();
    response = await SELF.fetch("https://cypher.test/api/cypher/v1/overview", { headers: { cookie } }); overview = (await response.json()).overview;
    expect(overview.outstanding_minor).toBe(34553); expect(overview.outstanding_documents).toBe(1);
  });

  it("fails closed when the Platform Owner email is not configured", async () => {
    const response = await SELF.fetch("https://cypher.test/api/cypher/platform/v1/passkeys/bootstrap/options", { method: "POST", headers: { origin: "https://cypher.test", authorization: "Bearer any", "content-type": "application/json" }, body: JSON.stringify({ email: "owner@example.test", display_name: "Owner" }) });
    expect(response.status).toBe(503); expect((await response.json()).message).toMatch(/email is not configured/i);
  });

  it("persists structured OpenAI evidence and normalizes store/vendor data", async () => {
    const document = await env.CYPHER.prepare("SELECT id FROM documents WHERE original_filename='invoice-9761.pdf'").first();
    const artifact = await env.CYPHER.prepare("SELECT object_key FROM document_artifacts WHERE document_id=? AND artifact_type='original'").bind(document.id).first();
    const jobId = "openai-test-job";
    await env.CYPHER.prepare("DELETE FROM processing_jobs WHERE document_id=?").bind(document.id).run();
    await env.CYPHER.prepare("INSERT INTO processing_jobs(id,tenant_id,document_id,job_type,status) VALUES(?,'tenant-test',?,'extract','queued')").bind(jobId, document.id).run();
    const data = Object.fromEntries(["document_type","po_number","invoice_number","store_number","invoice_date","invoice_time","po_date","supplier_legal_name","supplier_dba","customer","department","account_id","invoice_total","po_total","tax_total","currency","match_status","difference_amount","extraction_confidence","salesperson","vendor_id","register","ship_to_address","bill_to_address","warranty_information","vehicle_year_make_model","vin","license_plate","mileage","government_property_number","signatures_present","handwriting_detected","orientation_correction_applied"].map(function(key){return [key,null];}));
    Object.assign(data,{document_type:"invoice",po_number:"00045-2025140501",invoice_number:"9761523834721",store_number:"9761",invoice_date:"2025-08-26",supplier_legal_name:"Western Auto of PR Inc.",supplier_dba:"Advance Auto Parts",customer:"Negociado de la Policía de Puerto Rico",invoice_total:"345.53",po_total:"345.53",currency:"USD",match_status:"matched",extraction_confidence:.98,salesperson:"Manuel",vendor_id:"431544437",signatures_present:true,handwriting_detected:false,orientation_correction_applied:true,line_items:[{part_number:"TEST-1",quantity:"1",description:"Test part",po_line_price:"10.00",invoice_line_price:"12.00"}]});
    const apiFetch=vi.fn(async function(url){expect(String(url)).toBe("https://api.openai.com/v1/responses");return Response.json({id:"resp_test",output:[{content:[{type:"output_text",text:JSON.stringify(data)}]}]});}); vi.stubGlobal("fetch",apiFetch);
    const batch=createMessageBatch("cypher-document-jobs",[{id:"message-test",timestamp:new Date(),attempts:1,body:{schema:"cypher-job/v1",jobId,tenantId:"tenant-test",documentId:document.id,objectKey:artifact.object_key}}]);
    const ctx=createExecutionContext(); await worker.queue(batch,{...env,CYPHER_OPENAI_ENABLED:"true",CYPHER_AZURE_ENABLED:"false",OPENAI_API_KEY:"test-only",CYPHER_OPENAI_MODEL:"gpt-5.6-terra",CYPHER_OPENAI_FALLBACK_MODEL:"gpt-5.6-sol"},ctx);
    expect(await getQueueResult(batch,ctx)).toMatchObject({outcome:"ok"});
    const updated=await env.CYPHER.prepare("SELECT status,invoice_number,po_number,match_status,difference_minor,store_id,vendor_id FROM documents WHERE id=?").bind(document.id).first();
    expect(updated).toMatchObject({status:"needs_review",invoice_number:"9761523834721",po_number:"00045-2025140501",match_status:"variance",difference_minor:0});
    expect(updated.store_id).toBeTruthy(); expect(updated.vendor_id).toBeTruthy();
    expect((await env.CYPHER.prepare("SELECT store_number FROM stores WHERE id=?").bind(updated.store_id).first()).store_number).toBe("9761");
    expect((await env.CYPHER.prepare("SELECT vendor_number FROM vendors WHERE id=?").bind(updated.vendor_id).first()).vendor_number).toBe("431544437");
    expect(await env.CYPHER.prepare("SELECT match_status,variance_minor FROM document_line_items WHERE document_id=?").bind(document.id).first()).toMatchObject({match_status:"variance",variance_minor:200});
    expect(Number((await env.CYPHER.prepare("SELECT COUNT(*) total FROM document_artifacts WHERE document_id=? AND artifact_type='extraction'").bind(document.id).first()).total)).toBe(1);
    expect(apiFetch).toHaveBeenCalledTimes(1); vi.unstubAllGlobals();
  });

  it("creates validation evidence and an Excel-compatible register", async () => {
    const document = await env.CYPHER.prepare("SELECT id FROM documents WHERE original_filename='invoice-9761.pdf'").first();
    const fields = {po_number:"00045-2025140501",invoice_number:"9761523834721",store_number:"9761",invoice_date:"2025-08-26",po_total:"345.53",invoice_total:"345.53",match_status:"variance",extraction_confidence:"0.98",salesperson:"Manuel",vendor_id:"431544437"};
    const response = await SELF.fetch(`https://cypher.test/api/cypher/v1/documents/${document.id}/validate`, {method:"POST",headers:{origin:"https://cypher.test",cookie,"content-type":"application/json"},body:JSON.stringify({decision:"approved_with_variance",notes:"Confirmed test variance",fields})});
    expect(response.status).toBe(200); expect((await response.json()).status).toBe("validated");
    const artifacts = await env.CYPHER.prepare("SELECT artifact_type,object_key FROM document_artifacts WHERE document_id=? AND artifact_type IN ('validation_pdf','evidence_manifest')").bind(document.id).all();
    expect(artifacts.results.map((item) => item.artifact_type).sort()).toEqual(["evidence_manifest","validation_pdf"]);
    for (const artifact of artifacts.results) expect(await env.CYPHER_FILES.get(artifact.object_key)).toBeTruthy();
    expect((await env.CYPHER.prepare("SELECT classification FROM document_exposure WHERE document_id=?").bind(document.id).first()).classification).toBe("cleared");
    const exportResponse = await SELF.fetch("https://cypher.test/api/cypher/v1/reports/documents.csv", {headers:{cookie}}); expect(exportResponse.status).toBe(200); expect(exportResponse.headers.get("content-type")).toMatch(/text\/csv/); expect(await exportResponse.text()).toContain("9761523834721");
  });
});
