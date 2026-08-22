import { describe, expect, it } from "vitest";
import { cancelDelivery, controlledIntake, correctField, emptyCommercialState, explainRelationships, exportContract, finalizeEvidence,
  obligationTotals, recordGroundedExtraction, requestDelivery, sha256, simulateDelivery } from "../lib/cypher-commercial-v1.js";

describe("Cypher commercial v1 contract", () => {
  it("replays controlled intake without duplicate rows or outbox jobs", () => {
    const command = { tenantId: "t1", documentId: "d1", idempotencyKey: "upload-1", hash: "a".repeat(64), sizeBytes: 100 };
    const first = controlledIntake(emptyCommercialState(), command), second = controlledIntake(first.state, command);
    expect(second.replayed).toBe(true); expect(second.state.documents).toHaveLength(1); expect(second.state.outbox).toHaveLength(1);
    expect(first.document.objectKey).toContain(`/original/${"a".repeat(64)}.pdf`);
  });
  it("requires bilingual extraction grounding and preserves correction history", () => {
    const command = { tenantId: "t1", documentId: "d1", language: "es", provider: "fixture",
      fields: [{ key: "numero_factura", value: "Á-1", page: 1, boundingBox: [1,2,3,4], textSpan: [0,3] }] };
    const state = recordGroundedExtraction(emptyCommercialState(), command), run = state.extractions[0];
    const corrected = correctField(state, { tenantId: "t1", extractionId: run.id, fieldKey: "numero_factura", correctedValue: "A-1", correctedBy: "u1" });
    expect(corrected.corrections[0]).toMatchObject({ prior: "Á-1", correctedValue: "A-1" });
    expect(() => recordGroundedExtraction(emptyCommercialState(), { ...command, fields: [{ key: "x" }] })).toThrow("grounding");
    expect(() => recordGroundedExtraction(emptyCommercialState(), { ...command, language: "fr" })).toThrow("supported language");
    expect(() => recordGroundedExtraction(emptyCommercialState(), { ...command, fields: [] })).toThrow("fields required");
  });
  it("explains cross-location reuse without automatic disposition and retains line variance", () => {
    const rows = [{ id:"a",tenantId:"t",type:"invoice",invoiceNumber:"I1",poNumber:"P1",locationId:"L1",lineVariance:true },
      { id:"b",tenantId:"t",type:"invoice",invoiceNumber:"I1",poNumber:"P1",locationId:"L2" },
      { id:"x",tenantId:"other",type:"invoice",invoiceNumber:"I1",poNumber:"P1" }];
    const result = explainRelationships(rows, "t");
    expect(result).toHaveLength(2); expect(result.every((r) => !r.automaticDisposition)).toBe(true); expect(result.find((r) => r.type === "reused_po").lineVariance).toBe(true);
  });
  it("never counts unconfirmed or disputed items as debt", () => {
    const totals = obligationTotals([{ state:"unconfirmed",amountMinor:500 },{ state:"disputed",amountMinor:700 },
      { state:"confirmed_outstanding",amountMinor:900,confirmedBy:"u",dueAt:"2026-01-01" }], "2026-08-15");
    expect(totals.debtMinor).toBe(900); expect(totals.byState.overdue).toBe(900);
    expect(() => obligationTotals([{ state:"confirmed_outstanding",amountMinor:1,dueAt:"2099-01-01" }])).toThrow("human confirmation");
  });
  it("atomically refuses incomplete evidence and versions complete packages", () => {
    const base = { ...emptyCommercialState(), packages: [] }, artifacts = ["original","validation_pdf","evidence_manifest"].map((type) => ({ type, hash: sha256(type) }));
    expect(() => finalizeEvidence(base, { tenantId:"t",documentId:"d",validationId:"v",artifacts:artifacts.slice(0,2) })).toThrow("complete");
    const first = finalizeEvidence(base, { tenantId:"t",documentId:"d",validationId:"v",artifacts });
    const second = finalizeEvidence(first.state, { tenantId:"t",documentId:"d",validationId:"v2",artifacts });
    expect([first.package.version, second.package.version]).toEqual([1,2]);
  });
  it("declares CSV XLSX and JSON export contracts", () => {
    expect(exportContract("csv", [{ invoice:"A,1" }]).body).toContain('"A,1"');
    expect(exportContract("xlsx", []).mediaType).toContain("spreadsheetml");
    expect(JSON.parse(exportContract("json", []).body).schema).toBe("cypher-export/v1");
  });
  it("simulates idempotent delivery, retry, cancellation boundary and revocation with hash receipt", () => {
    let state = { ...emptyCommercialState(), connectors: [{ id:"c",tenantId:"t",status:"active" }] };
    const command = { tenantId:"t",connectorId:"c",evidencePackageId:"p",idempotencyKey:"deliver:p:c",sourceHash:"b".repeat(64),requestedBy:"u" };
    const first = requestDelivery(state, command); state = first.state;
    expect(requestDelivery(state, command).replayed).toBe(true);
    state = simulateDelivery(state, { tenantId:"t",deliveryId:first.delivery.id,attemptKey:"a1",outcome:"failed" }); expect(state.deliveries[0].status).toBe("retrying");
    const replay = simulateDelivery(state, { tenantId:"t",deliveryId:first.delivery.id,attemptKey:"a1",outcome:"failed" }); expect(replay.deliveries[0].attempts).toHaveLength(1);
    state = simulateDelivery(state, { tenantId:"t",deliveryId:first.delivery.id,attemptKey:"a2" }); expect(state.deliveries[0].verifiedHash).toBe(command.sourceHash);
    expect(() => simulateDelivery(state, { tenantId:"t",deliveryId:first.delivery.id,attemptKey:"a3" })).toThrow("terminal");
    let cancellable = requestDelivery({ ...emptyCommercialState(),connectors:[{id:"c",tenantId:"t",status:"active"}] }, { ...command,idempotencyKey:"cancel" }).state;
    cancellable = cancelDelivery(cancellable,{tenantId:"t",deliveryId:cancellable.deliveries[0].id}); expect(cancellable.deliveries[0].status).toBe("cancelled");
    expect(() => simulateDelivery(cancellable,{tenantId:"t",deliveryId:cancellable.deliveries[0].id,attemptKey:"x"})).toThrow("terminal");
    expect(() => cancelDelivery(state,{tenantId:"other",deliveryId:first.delivery.id})).toThrow("not found");
  });
});
