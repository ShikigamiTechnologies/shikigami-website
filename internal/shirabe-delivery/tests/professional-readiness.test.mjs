import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { auditPublicParity, evaluateDesignPartner, validateProfessionalSignoffs } from "../professional-readiness.mjs";

const reviewFile = new URL("../reviews/professional-review-checklists.json", import.meta.url);
const candidateFile = new URL("../reviews/design-partner-evidence-candidate.json", import.meta.url);
const enFile = new URL("../../../services/shirabe/index.html", import.meta.url);
const esFile = new URL("../../../es/servicios/shirabe/index.html", import.meta.url);
const json = async (url) => JSON.parse(await readFile(url, "utf8"));

test("professional checklist remains incomplete without real signoffs", async () => {
  const result = validateProfessionalSignoffs(await json(reviewFile));
  assert.equal(result.passed, false);
  assert.equal(result.complete, false);
  assert.deepEqual(result.errors, []);
});

test("professional approval requires identity, qualifications, date, scope and evidence", async () => {
  const packet = await json(reviewFile);
  packet.reviews[0].status = "approved";
  const result = validateProfessionalSignoffs(packet);
  assert.ok(result.errors.includes("signoff_evidence_missing:legal:reviewer_name"));
  assert.ok(result.errors.includes("signoff_evidence_missing:legal:reviewer_qualification"));
  assert.ok(result.errors.includes("signoff_evidence_missing:legal:reviewed_at"));
  assert.ok(result.errors.includes("signoff_evidence_missing:legal:evidence_reference"));
});

test("worker self-approval is prohibited", async () => {
  const packet = await json(reviewFile);
  Object.assign(packet.reviews[0], { status: "approved", reviewer_name: "Independent reviewer", reviewer_qualification: "Recorded qualification", reviewed_at: "2026-09-02", evidence_reference: "review-evidence-sha256", self_approved: true });
  assert.ok(validateProfessionalSignoffs(packet).errors.includes("self_approval_prohibited:legal"));
});

test("current public English and Spanish material concepts and prices align", async () => {
  const result = auditPublicParity(await readFile(enFile, "utf8"), await readFile(esFile, "utf8"));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.prices, ["$1,500–$2,500", "$7,500–$12,500", "$15,000–$25,000"]);
});

test("public price drift fails parity", async () => {
  const en = await readFile(enFile, "utf8");
  const es = (await readFile(esFile, "utf8")).replace("$1,500–$2,500", "$2,000–$3,000");
  assert.ok(auditPublicParity(en, es).errors.includes("public_price_parity_mismatch"));
});

test("design-partner candidate cannot pass without real evidence", async () => {
  const result = evaluateDesignPartner(await json(candidateFile));
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("real_customer_evidence_required"));
  assert.ok(result.failures.includes("customer_signoff_evidence_required"));
  assert.ok(result.failures.includes("two_accepted_findings_required"));
});

test("synthetic evidence cannot satisfy an otherwise complete scorecard", async () => {
  const record = await json(candidateFile);
  Object.assign(record, {
    evidence_kind: "synthetic",
    contract_executed: true,
    scope_signed: true,
    authority_bound: true,
    engagement_completed: true,
    package_verified: true,
    restore_rehearsed: true,
    deletion_or_retention_verified: true,
    customer_acceptance_signed: true,
    evidence_manifest_hash: "a".repeat(64),
    customer_signoff_reference: "signed-customer-record-1",
    material_findings_with_provenance_rate: 1,
    accepted_actionable_findings: 2,
    validated_measurable_opportunities: 1,
    delivery_hours: 40,
    delivery_cost: 5000
  });
  assert.deepEqual(evaluateDesignPartner(record).failures, ["real_customer_evidence_required"]);
});

