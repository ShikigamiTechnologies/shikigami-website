import { PDFDocument, StandardFonts } from "pdf-lib";
import { createWorkbook } from "./cypher-batch-b-service.js";

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

async function serviceJson(env, path, init = {}) {
  const origin = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const secret = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!origin || !secret) throw new Error("outbox_worker_not_configured");
  const response = await fetch(`${origin}${path}`, { ...init, headers: { ...headers(secret), ...(init.headers || {}) }, redirect: "manual", signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`service_http_${response.status}:${text.slice(0,300)}`);
  return text ? JSON.parse(text) : null;
}

async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function evidenceBytes(document) {
  const record = { id: document.id, status: document.status, original_hash: document.original_hash, validated: document.validated, evidence_hash: document.evidence_hash };
  const json = new TextEncoder().encode(JSON.stringify(record, null, 2) + "\n");
  const csv = new TextEncoder().encode(`document_id,status,original_hash,validated\n${document.id},${document.status},${document.original_hash},${document.validated}\n`);
  const manifest = new TextEncoder().encode(JSON.stringify({ schema: "cypher-evidence-manifest/v1", document: record, generated_at: new Date().toISOString() }, null, 2) + "\n");
  const workbook = new Uint8Array(await createWorkbook([{ id: document.id, artifact: document.original_path, sha256: document.original_hash, mime: document.mime_type, extracted: {}, ocr: { confidence: 100 } }]));
  const pdf = await PDFDocument.create(), page = pdf.addPage([612,792]), font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Cypher Validation Evidence", { x: 54, y: 730, size: 18, font });
  page.drawText(`Document: ${document.id}`, { x: 54, y: 700, size: 10, font });
  page.drawText(`Status: ${document.status}`, { x: 54, y: 682, size: 10, font });
  page.drawText(`SHA-256: ${document.original_hash}`, { x: 54, y: 664, size: 8, font });
  return { validation_pdf: new Uint8Array(await pdf.save()), evidence_manifest: manifest, export_csv: csv, export_json: json, export_xlsx: workbook };
}

async function uploadVerified(env, tenantId, documentId, type, bytes) {
  const id = crypto.randomUUID(), path = `${tenantId}/artifacts/${documentId}/${id}-${type}`;
  const origin = String(env.SUPABASE_URL).replace(/\/$/, ""), secret = env.SUPABASE_SERVICE_ROLE_KEY;
  const mime = { validation_pdf:"application/pdf", evidence_manifest:"application/json", export_csv:"text/csv", export_json:"application/json", export_xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }[type];
  const upload = await fetch(`${origin}/storage/v1/object/cypher-documents/${path}`, { method: "POST", headers: { apikey: secret, authorization: `Bearer ${secret}`, "content-type": mime, "x-upsert": "false" }, body: bytes, redirect: "manual", signal: AbortSignal.timeout(15000) });
  if (!upload.ok) throw new Error(`artifact_upload_${upload.status}:${(await upload.text()).slice(0,200)}`);
  const downloaded = await fetch(`${origin}/storage/v1/object/authenticated/cypher-documents/${path}`, { headers: { apikey: secret, authorization: `Bearer ${secret}` }, redirect: "manual", signal: AbortSignal.timeout(15000) });
  if (!downloaded.ok) throw new Error(`artifact_verify_${downloaded.status}`);
  const observed = new Uint8Array(await downloaded.arrayBuffer()), hash = await digest(bytes);
  if (observed.byteLength !== bytes.byteLength || await digest(observed) !== hash) throw new Error("artifact_integrity_failure");
  return { id, type, path, hash, size: bytes.byteLength };
}

async function buildEvidence(job, env) {
  const rows = await serviceJson(env, `/rest/v1/cypher_documents?id=eq.${encodeURIComponent(job.aggregate_id)}&select=*`);
  const document = rows?.[0];
  if (!document || document.status !== "validated" || !document.validated) throw new Error("validated_document_required");
  const generated = [];
  for (const [type, bytes] of Object.entries(await evidenceBytes(document))) generated.push(await uploadVerified(env, document.tenant_id, document.id, type, bytes));
  return rpc(env, "cypher_register_generated_evidence", { target_document: document.id, generated });
}

async function deliver(job, env) {
  return rpc(env, "cypher_execute_simulated_delivery", { target_delivery: job.aggregate_id });
}

async function execute(job, env) {
  if (job.topic === "extract") {
    if (env.CYPHER_STAGING_MODE !== "synthetic_only") throw new Error("live_ocr_not_authorized");
    return rpc(env, "cypher_run_extraction", {
      target_document: job.aggregate_id,
      extracted_fields: { processing_state: "synthetic_staging", source: "verified_private_upload" },
    });
  }
  if (job.topic === "evidence") {
    if (env.CYPHER_STAGING_MODE !== "synthetic_only") throw new Error("evidence_worker_not_authorized");
    return buildEvidence(job, env);
  }
  if (job.topic === "destination_delivery") {
    if (env.CYPHER_STAGING_MODE !== "synthetic_only" || env.CYPHER_LIVE_CONNECTORS_ENABLED === "true") throw new Error("live_delivery_not_authorized");
    return deliver(job, env);
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
