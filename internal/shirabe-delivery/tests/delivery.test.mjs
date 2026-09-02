import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { calculateRoi, createPackage, deletionRehearsal, makeId, readJson, restorePackage, scaffold, sha256, validateEngagement, verifyPackage } from "../lib.mjs";

const fixturePath = new URL("../fixtures/adversarial-bilingual-engagement.json", import.meta.url);
const fixture = () => readJson(fixturePath);
const clone = (value) => JSON.parse(JSON.stringify(value));

test("full adversarial bilingual engagement validates", async () => {
  const result = validateEngagement(await fixture());
  assert.deepEqual(result.errors, []);
  assert.equal(result.passed, true);
});

test("deterministic IDs and ROI remain stable", async () => {
  assert.equal(makeId("finding", "same"), makeId("finding", "same"));
  assert.deepEqual(calculateRoi((await fixture()).roi), {
    current_monthly_cost: 1440,
    projected_monthly_benefit: 120,
    projected_monthly_net: 20,
    break_even_months: 250,
    disclosure: "Deterministic scenario output; projected values are not observed savings."
  });
});

test("material findings require admitted evidence", async () => {
  const data = await fixture();
  data.findings[0].evidence_refs = [];
  assert.ok(validateEngagement(data).errors.includes(`material_finding_uncited:${data.findings[0].id}`));
});

test("hostile evidence cannot be admitted", async () => {
  const data = await fixture();
  data.evidence.at(-1).status = "admitted";
  assert.ok(validateEngagement(data).errors.some((item) => item.startsWith("unsafe_evidence_admitted")));
});

test("live connectors and customer data qualification fail closed", async () => {
  const data = await fixture();
  data.engagement.synthetic = false;
  data.data_boundary.live_connectors = true;
  const errors = validateEngagement(data).errors;
  assert.ok(errors.includes("customer_data_prohibited_in_local_qualification"));
  assert.ok(errors.includes("boundary_must_be_false:live_connectors"));
});

test("critical bilingual numbers cannot drift", async () => {
  const data = await fixture();
  data.reports.es.critical_statements[1].text = "El registro respalda 54 horas.";
  assert.ok(validateEngagement(data).errors.includes("parity_number_mismatch:finding"));
});

test("package detects tampering and clean restore verifies", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shirabe-package-"));
  const pkg = path.join(root, "package");
  await createPackage(fixturePath, pkg);
  assert.equal((await verifyPackage(pkg)).passed, true);
  const restored = path.join(root, "restored");
  assert.equal((await restorePackage(pkg, restored)).passed, true);
  await writeFile(path.join(pkg, "roi-results.json"), "tampered\n");
  assert.equal((await verifyPackage(pkg)).passed, false);
});

test("identical inputs produce identical package hashes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shirabe-repeat-"));
  const first = await createPackage(fixturePath, path.join(root, "one"));
  const second = await createPackage(fixturePath, path.join(root, "two"));
  assert.equal(first.package_hash, second.package_hash);
});

test("evidence tampering and missing event references fail", async () => {
  const data = await fixture();
  data.evidence[0].content += " altered";
  data.events[0].evidence_id = "EV-000000000000";
  const errors = validateEngagement(data).errors;
  assert.ok(errors.some((item) => item.startsWith("evidence_hash_mismatch")));
  assert.ok(errors.some((item) => item.startsWith("event_evidence_missing")));
});

test("human conflict disposition requires recorded authority", async () => {
  const data = await fixture();
  data.conflicts[0].status = "human_dispositioned";
  data.conflicts[0].disposition_by = "unregistered-role";
  assert.ok(validateEngagement(data).errors.some((item) => item.startsWith("conflict_disposition_authority_missing")));
});

test("correction lineage preserves predecessor, human authority, reason and time", async () => {
  const data = await fixture();
  const corrected = data.evidence.find((item) => item.correction_of);
  assert.equal(corrected.correction_of, "EV-A1B2C3D4E5F6");
  assert.equal(data.evidence.find((item) => item.id === corrected.correction_of).status, "superseded");
  assert.equal(validateEngagement(data).passed, true);
});

test("corrected evidence without a predecessor fails closed", async () => {
  const data = await fixture();
  const corrected = data.evidence.find((item) => item.correction_of);
  corrected.correction_of = "EV-000000000000";
  assert.ok(validateEngagement(data).errors.includes(`correction_predecessor_unknown:${corrected.id}:EV-000000000000`));
});

test("correction requires predecessor supersession and named human metadata", async () => {
  const data = await fixture();
  const corrected = data.evidence.find((item) => item.correction_of);
  data.evidence.find((item) => item.id === corrected.correction_of).status = "admitted";
  corrected.corrected_by = "unknown-worker";
  corrected.correction_reason = "";
  corrected.corrected_at = "not-a-time";
  const errors = validateEngagement(data).errors;
  assert.ok(errors.some((item) => item.startsWith("correction_predecessor_not_superseded")));
  assert.ok(errors.includes(`correction_authority_missing:${corrected.id}`));
  assert.ok(errors.includes(`correction_reason_missing:${corrected.id}`));
  assert.ok(errors.includes(`correction_timestamp_invalid:${corrected.id}`));
});

test("correction cycles and self-reference fail closed", async () => {
  const data = await fixture();
  const corrected = data.evidence.find((item) => item.correction_of);
  corrected.correction_of = corrected.id;
  const errors = validateEngagement(data).errors;
  assert.ok(errors.includes(`correction_self_reference:${corrected.id}`));
  assert.ok(errors.includes(`correction_cycle:${corrected.id}`));
});

test("deletion rehearsal removes restored target but retains minimal receipt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shirabe-delete-"));
  const pkg = path.join(root, "package");
  await createPackage(fixturePath, pkg);
  const receiptPath = path.join(root, "receipt.json");
  const receipt = await deletionRehearsal(pkg, path.join(root, "working"), receiptPath);
  assert.equal(receipt.target_absent, true);
  assert.equal(JSON.parse(await readFile(receiptPath, "utf8")).synthetic_only, true);
});

test("scaffold is valid and contains no autonomous capabilities", () => {
  const data = scaffold("SHR-ENG-SYNTHETIC-NEW");
  assert.equal(validateEngagement(data).passed, true);
  assert.equal(data.data_boundary.autonomous_actions, false);
});
