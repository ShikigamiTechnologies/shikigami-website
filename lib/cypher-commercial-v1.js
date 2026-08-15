import { createHash, randomUUID } from "node:crypto";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const immutableOriginalKey = ({ tenantId, documentId, hash, extension = "pdf" }) =>
  `${tenantId}/documents/${documentId}/original/${hash}.${extension}`;

export function controlledIntake(state, command) {
  const prior = state.documents.find((d) => d.tenantId === command.tenantId && d.idempotencyKey === command.idempotencyKey);
  if (prior) return { state, document: prior, replayed: true };
  if (!command.idempotencyKey || !/^[a-f0-9]{64}$/.test(command.hash)) throw new Error("invalid intake identity");
  if (command.sizeBytes < 1 || command.sizeBytes > 15 * 1024 * 1024) throw new Error("upload outside pilot envelope");
  const id = command.documentId || randomUUID();
  const document = { id, tenantId: command.tenantId, idempotencyKey: command.idempotencyKey, hash: command.hash,
    objectKey: immutableOriginalKey({ tenantId: command.tenantId, documentId: id, hash: command.hash }), status: "quarantined" };
  return { state: { ...state, documents: [...state.documents, document], outbox: [...state.outbox,
    { id: randomUUID(), tenantId: command.tenantId, topic: "extract", key: `extract:${id}:1`, status: "pending" }] }, document, replayed: false };
}

export function recordGroundedExtraction(state, command) {
  if (!["en", "es", "bilingual"].includes(command.language) || !Array.isArray(command.fields) || command.fields.length === 0)
    throw new Error("supported language and fields required");
  const fields = command.fields.map((f) => {
    if (!f.key || !Number.isInteger(f.page) || f.page < 1 || !Array.isArray(f.boundingBox) || f.boundingBox.length === 0 || !Array.isArray(f.textSpan) || f.textSpan.length === 0)
      throw new Error("field grounding required");
    return { ...f, language: command.language };
  });
  const run = { id: randomUUID(), tenantId: command.tenantId, documentId: command.documentId,
    version: 1 + state.extractions.filter((e) => e.tenantId === command.tenantId && e.documentId === command.documentId).length,
    language: command.language, provider: command.provider, fields };
  return { ...state, extractions: [...state.extractions, run] };
}

export function correctField(state, command) {
  const extraction = state.extractions.find((e) => e.id === command.extractionId && e.tenantId === command.tenantId);
  if (!extraction) throw new Error("extraction not found");
  const prior = extraction.fields.find((f) => f.key === command.fieldKey)?.value;
  return { ...state, corrections: [...state.corrections, { ...command, id: randomUUID(), prior, createdAt: new Date(0).toISOString() }] };
}

export function explainRelationships(documents, tenantId) {
  const own = documents.filter((d) => d.tenantId === tenantId), relationships = [];
  for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) {
    const [a, b] = [own[i], own[j]];
    if (a.invoiceNumber && a.invoiceNumber === b.invoiceNumber)
      relationships.push({ type: "duplicate_invoice", source: a.id, related: b.id, automaticDisposition: false, locations: [a.locationId, b.locationId] });
    if (a.poNumber && a.poNumber === b.poNumber)
      relationships.push({ type: a.type !== b.type ? "po_match" : "reused_po", source: a.id, related: b.id,
        automaticDisposition: false, locations: [a.locationId, b.locationId], lineVariance: Boolean(a.lineVariance || b.lineVariance) });
  }
  return relationships;
}

export function obligationTotals(obligations, today = "9999-12-31") {
  return obligations.reduce((out, item) => {
    const state = item.state === "confirmed_outstanding" && item.dueAt < today ? "overdue" : item.state;
    if (["confirmed_outstanding", "overdue"].includes(state) && !item.confirmedBy) throw new Error("human confirmation required");
    if (["confirmed_outstanding", "overdue"].includes(state)) out.debtMinor += item.amountMinor;
    out.byState[state] = (out.byState[state] || 0) + item.amountMinor;
    return out;
  }, { debtMinor: 0, byState: {} });
}

export function finalizeEvidence(state, command) {
  const required = ["original", "validation_pdf", "evidence_manifest"];
  if (required.some((type) => !command.artifacts.find((a) => a.type === type && /^[a-f0-9]{64}$/.test(a.hash))))
    throw new Error("complete hashed evidence required");
  const version = 1 + state.packages.filter((p) => p.tenantId === command.tenantId && p.documentId === command.documentId).length;
  const canonical = JSON.stringify({ schema: "cypher-evidence/v1", tenantId: command.tenantId, documentId: command.documentId,
    validationId: command.validationId, version, artifacts: command.artifacts.map(({ type, hash }) => ({ type, hash })) });
  const pack = { id: randomUUID(), tenantId: command.tenantId, documentId: command.documentId, version, hash: sha256(canonical), canonical };
  return { state: { ...state, packages: [...state.packages, pack] }, package: pack };
}

export const exportContract = (format, rows) => {
  if (format === "json") return { mediaType: "application/json", extension: "json", body: JSON.stringify({ schema: "cypher-export/v1", rows }) };
  if (format === "csv") {
    const keys = Object.keys(rows[0] || {}), quote = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    return { mediaType: "text/csv; charset=utf-8", extension: "csv", body: [keys.map(quote), ...rows.map((r) => keys.map((k) => quote(r[k])))].map((r) => r.join(",")).join("\r\n") };
  }
  if (format === "xlsx") return { mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx", schema: "cypher-xlsx/v1", rows };
  throw new Error("unsupported export format");
};

export function requestDelivery(state, command) {
  const connector = state.connectors.find((c) => c.id === command.connectorId && c.tenantId === command.tenantId);
  if (!connector || connector.status === "revoked") throw new Error("connector unavailable");
  const prior = state.deliveries.find((d) => d.tenantId === command.tenantId && d.idempotencyKey === command.idempotencyKey);
  if (prior) return { state, delivery: prior, replayed: true };
  const delivery = { id: randomUUID(), ...command, status: "pending", attempts: [], verifiedHash: null };
  return { state: { ...state, deliveries: [...state.deliveries, delivery], outbox: [...state.outbox,
    { id: randomUUID(), tenantId: command.tenantId, topic: "destination_delivery", key: command.idempotencyKey, status: "pending" }] }, delivery, replayed: false };
}

export function cancelDelivery(state, { tenantId, deliveryId }) {
  const delivery = state.deliveries.find((d) => d.id === deliveryId && d.tenantId === tenantId);
  if (!delivery) throw new Error("delivery not found");
  if (!["pending", "retrying"].includes(delivery.status)) throw new Error("terminal delivery");
  return { ...state, deliveries: state.deliveries.map((d) => d === delivery ? { ...d, status: "cancelled" } : d) };
}

export function simulateDelivery(state, { tenantId, deliveryId, attemptKey, outcome = "delivered" }) {
  return { ...state, deliveries: state.deliveries.map((d) => {
    if (d.id !== deliveryId || d.tenantId !== tenantId) return d;
    if (["delivered", "cancelled", "revoked"].includes(d.status)) throw new Error("terminal delivery");
    if (!attemptKey) throw new Error("attempt key required");
    const prior = d.attempts.find((a) => a.attemptKey === attemptKey);
    if (prior) return d;
    const connector = state.connectors.find((c) => c.id === d.connectorId && c.tenantId === tenantId);
    if (!connector || connector.status === "revoked") return { ...d, status: "revoked", attempts: [...d.attempts, { attemptKey, status: "revoked" }] };
    const delivered = outcome === "delivered";
    if (!delivered && outcome !== "failed") throw new Error("invalid outcome");
    const number = d.attempts.length + 1;
    const receipt = delivered ? sha256(JSON.stringify({ attemptKey, deliveryId: d.id, number, outcome, sourceHash: d.sourceHash })) : null;
    return { ...d, status: delivered ? "delivered" : "retrying", verifiedHash: delivered ? d.sourceHash : null,
      attempts: [...d.attempts, { attemptKey, number, status: delivered ? "delivered" : "failed", receipt }] };
  }) };
}

export const emptyCommercialState = () => ({ documents: [], outbox: [], extractions: [], corrections: [], packages: [], connectors: [], deliveries: [] });
