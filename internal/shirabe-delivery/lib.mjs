import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, cp, rm, stat } from "node:fs/promises";
import path from "node:path";

export const SCHEMA = "shirabe-engagement/v1";
export const TOOL_VERSION = "1.0.0";
const classes = new Set(["measured", "reported", "estimated", "projected", "unknown"]);
const admitted = new Set(["admitted"]);
const dangerous = [/ignore (?:all )?(?:previous )?instructions/i, /system prompt/i, /BEGIN PRIVATE KEY/i, /password\s*[:=]/i];

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonical(value)).digest("hex");
}

export function makeId(kind, seed = randomUUID()) {
  const prefix = { evidence: "EV", event: "EVT", finding: "FND", conflict: "CFL" }[kind];
  if (!prefix) throw new Error(`unknown_id_kind:${kind}`);
  return `${prefix}-${sha256(seed).slice(0, 12).toUpperCase()}`;
}

function numberTokens(text) {
  return [...String(text).matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

export function calculateRoi(roi) {
  const input = roi?.inputs || {};
  const numeric = (name) => Number(input[name]?.value ?? 0);
  for (const [name, item] of Object.entries(input)) {
    if (!classes.has(item.classification)) throw new Error(`roi_invalid_classification:${name}`);
    if (item.classification !== "unknown" && !Number.isFinite(Number(item.value))) throw new Error(`roi_invalid_number:${name}`);
  }
  const volume = numeric("monthly_volume");
  const touch = numeric("touch_minutes");
  const rework = numeric("rework_rate");
  const labor = numeric("labor_rate_hourly");
  const implementation = numeric("implementation_cost");
  const ongoing = numeric("monthly_operating_cost");
  const reduction = numeric("projected_rework_reduction");
  const currentMonthly = volume * (touch / 60) * labor * (1 + rework);
  const benefit = volume * (touch / 60) * labor * rework * reduction;
  const net = benefit - ongoing;
  return {
    current_monthly_cost: round(currentMonthly),
    projected_monthly_benefit: round(benefit),
    projected_monthly_net: round(net),
    break_even_months: net > 0 ? round(implementation / net) : null,
    disclosure: "Deterministic scenario output; projected values are not observed savings."
  };
}

function round(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }

export function validateEngagement(data) {
  const errors = [];
  if (data?.schema !== SCHEMA) errors.push("schema_invalid");
  if (!/^SHR-ENG-[A-Z0-9-]+$/.test(data?.engagement?.id || "")) errors.push("engagement_id_invalid");
  if (data?.engagement?.synthetic !== true) errors.push("customer_data_prohibited_in_local_qualification");
  for (const flag of ["customer_portal", "live_connectors", "autonomous_actions", "cross_engagement_training"]) {
    if (data?.data_boundary?.[flag] !== false) errors.push(`boundary_must_be_false:${flag}`);
  }
  const roleIds = new Set((data?.authority?.roles || []).map((item) => item.id));
  if (!roleIds.has(data?.authority?.engagement_director)) errors.push("engagement_director_missing");
  const evidence = data?.evidence || [];
  const evidenceIds = new Set();
  for (const item of evidence) {
    if (!/^EV-[A-F0-9]{12}$/.test(item.id || "")) errors.push(`evidence_id_invalid:${item.id || "missing"}`);
    if (evidenceIds.has(item.id)) errors.push(`evidence_id_duplicate:${item.id}`);
    evidenceIds.add(item.id);
    const contentHash = sha256(item.content || "");
    if (item.sha256 !== contentHash) errors.push(`evidence_hash_mismatch:${item.id}`);
    if (admitted.has(item.status) && dangerous.some((pattern) => pattern.test(item.content || ""))) errors.push(`unsafe_evidence_admitted:${item.id}`);
    if (!roleIds.has(item.custodian)) errors.push(`evidence_custodian_missing:${item.id}`);
  }
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  for (const item of evidence) {
    const declaresCorrection = Boolean(item.correction_of) || /corrected/i.test(item.classification || "");
    if (!declaresCorrection) continue;
    if (!item.correction_of) { errors.push(`correction_predecessor_missing:${item.id}`); continue; }
    if (item.correction_of === item.id) errors.push(`correction_self_reference:${item.id}`);
    const predecessor = evidenceById.get(item.correction_of);
    if (!predecessor) errors.push(`correction_predecessor_unknown:${item.id}:${item.correction_of}`);
    else if (predecessor.status !== "superseded") errors.push(`correction_predecessor_not_superseded:${item.id}:${item.correction_of}`);
    if (item.status !== "admitted") errors.push(`corrected_evidence_not_admitted:${item.id}`);
    if (!item.corrected_by || !roleIds.has(item.corrected_by)) errors.push(`correction_authority_missing:${item.id}`);
    if (!item.correction_reason || !String(item.correction_reason).trim()) errors.push(`correction_reason_missing:${item.id}`);
    if (!item.corrected_at || Number.isNaN(Date.parse(item.corrected_at))) errors.push(`correction_timestamp_invalid:${item.id}`);
    const visited = new Set([item.id]);
    let cursor = item;
    while (cursor?.correction_of) {
      if (visited.has(cursor.correction_of)) { errors.push(`correction_cycle:${item.id}`); break; }
      visited.add(cursor.correction_of);
      cursor = evidenceById.get(cursor.correction_of);
    }
  }
  const eventIds = new Set();
  for (const item of data?.events || []) {
    if (!/^EVT-[A-F0-9]{12}$/.test(item.id || "")) errors.push(`event_id_invalid:${item.id || "missing"}`);
    if (eventIds.has(item.id)) errors.push(`event_id_duplicate:${item.id}`);
    eventIds.add(item.id);
    if (!evidenceIds.has(item.evidence_id)) errors.push(`event_evidence_missing:${item.id}`);
    else if (!admitted.has(evidence.find((entry) => entry.id === item.evidence_id)?.status)) errors.push(`event_evidence_not_admitted:${item.id}`);
    if (!new Set(["observed", "reported", "inferred", "unknown"]).has(item.certainty)) errors.push(`event_certainty_invalid:${item.id}`);
  }
  for (const item of data?.conflicts || []) {
    if (!/^CFL-[A-F0-9]{12}$/.test(item.id || "")) errors.push(`conflict_id_invalid:${item.id || "missing"}`);
    if (!item.status || !["open", "human_dispositioned"].includes(item.status)) errors.push(`conflict_status_invalid:${item.id}`);
    if (item.status === "human_dispositioned" && (!item.disposition_by || !roleIds.has(item.disposition_by))) errors.push(`conflict_disposition_authority_missing:${item.id}`);
    for (const ref of item.evidence_refs || []) if (!evidenceIds.has(ref)) errors.push(`conflict_evidence_missing:${item.id}:${ref}`);
  }
  for (const item of data?.findings || []) {
    if (!/^FND-[A-F0-9]{12}$/.test(item.id || "")) errors.push(`finding_id_invalid:${item.id || "missing"}`);
    if (item.material && !(item.evidence_refs || []).length) errors.push(`material_finding_uncited:${item.id}`);
    for (const ref of item.evidence_refs || []) {
      const source = evidence.find((entry) => entry.id === ref);
      if (!source) errors.push(`finding_evidence_missing:${item.id}:${ref}`);
      else if (!admitted.has(source.status)) errors.push(`finding_evidence_not_admitted:${item.id}:${ref}`);
    }
    if (item.approved && !roleIds.has(item.approved_by)) errors.push(`finding_approval_authority_missing:${item.id}`);
  }
  try { calculateRoi(data?.roi); } catch (error) { errors.push(error.message); }
  const en = new Map((data?.reports?.en?.critical_statements || []).map((item) => [item.key, item.text]));
  const es = new Map((data?.reports?.es?.critical_statements || []).map((item) => [item.key, item.text]));
  for (const [key, text] of en) {
    if (!es.has(key)) errors.push(`parity_missing_es:${key}`);
    else if (canonical(numberTokens(text)) !== canonical(numberTokens(es.get(key)))) errors.push(`parity_number_mismatch:${key}`);
  }
  for (const key of es.keys()) if (!en.has(key)) errors.push(`parity_missing_en:${key}`);
  return { passed: errors.length === 0, errors, checked_at: new Date().toISOString(), tool_version: TOOL_VERSION };
}

export async function readJson(file) { return JSON.parse(await readFile(file, "utf8")); }
export async function writeJson(file, value) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

export async function createPackage(engagementFile, outputDirectory) {
  const data = await readJson(engagementFile);
  const validation = validateEngagement(data);
  if (!validation.passed) throw new Error(`validation_failed:${validation.errors.join("|")}`);
  await mkdir(outputDirectory, { recursive: true });
  const roi = calculateRoi(data.roi);
  const frozenValidation = { ...validation, checked_at: data.engagement.package_generated_at || data.engagement.created_at || "1970-01-01T00:00:00.000Z" };
  const aar = createAar(data, frozenValidation, roi);
  const artifacts = { "engagement.json": data, "validation.json": frozenValidation, "roi-results.json": roi, "AAR.json": aar };
  for (const [name, value] of Object.entries(artifacts)) await writeJson(path.join(outputDirectory, name), value);
  const manifest = { schema: "shirabe-package-manifest/v1", engagement_id: data.engagement.id, generated_at: frozenValidation.checked_at, tool_version: TOOL_VERSION, files: [] };
  for (const name of Object.keys(artifacts).sort()) {
    const bytes = await readFile(path.join(outputDirectory, name));
    manifest.files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  manifest.package_hash = sha256(manifest.files);
  await writeJson(path.join(outputDirectory, "manifest.json"), manifest);
  return manifest;
}

export async function verifyPackage(directory) {
  const manifest = await readJson(path.join(directory, "manifest.json"));
  const errors = [];
  if (manifest.schema !== "shirabe-package-manifest/v1") errors.push("manifest_schema_invalid");
  for (const file of manifest.files || []) {
    try {
      const bytes = await readFile(path.join(directory, file.path));
      if (bytes.length !== file.bytes) errors.push(`size_mismatch:${file.path}`);
      if (sha256(bytes) !== file.sha256) errors.push(`hash_mismatch:${file.path}`);
    } catch { errors.push(`missing_file:${file.path}`); }
  }
  if (sha256(manifest.files || []) !== manifest.package_hash) errors.push("package_hash_mismatch");
  return { passed: errors.length === 0, errors, package_hash: manifest.package_hash };
}

export async function restorePackage(source, destination) {
  try { await stat(destination); throw new Error("restore_destination_must_not_exist"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const before = await verifyPackage(source);
  if (!before.passed) throw new Error(`source_verification_failed:${before.errors.join("|")}`);
  await cp(source, destination, { recursive: true, errorOnExist: true });
  const after = await verifyPackage(destination);
  if (!after.passed) throw new Error(`restored_verification_failed:${after.errors.join("|")}`);
  return { passed: true, package_hash: after.package_hash };
}

export async function deletionRehearsal(source, working, receiptFile) {
  await restorePackage(source, working);
  const manifest = await readJson(path.join(working, "manifest.json"));
  await rm(working, { recursive: true });
  let absent = false;
  try { await stat(working); } catch (error) { absent = error.code === "ENOENT"; }
  const receipt = { schema: "shirabe-deletion-receipt/v1", engagement_id: manifest.engagement_id, package_hash: manifest.package_hash, synthetic_only: true, deleted_at: new Date().toISOString(), target_absent: absent };
  await writeJson(receiptFile, receipt);
  return receipt;
}

export function createAar(data, validation, roi) {
  return {
    schema: "shirabe-engagement-aar/v1",
    engagement_id: data.engagement.id,
    synthetic_only: data.engagement.synthetic,
    status: validation.passed ? "local_qualification_passed" : "failed",
    counts: { evidence: data.evidence.length, events: data.events.length, conflicts: data.conflicts.length, findings: data.findings.length },
    open_conflicts: data.conflicts.filter((item) => item.status === "open").length,
    roi,
    external_actions: 0,
    customer_data_records: 0,
    autonomous_approvals: 0,
    remaining_gates: ["independent bilingual review", "privacy and security review", "contract packet", "controlled design partner", "owner launch approval"]
  };
}

export function scaffold(id) {
  const evidenceId = makeId("evidence", `${id}:example`);
  return {
    schema: SCHEMA,
    engagement: { id, name: "Synthetic diagnostic", workflow: "One bounded workflow", status: "draft", synthetic: true, stop_point: "Decision package only; no implementation" },
    authority: { engagement_director: "role-director", roles: [{ id: "role-director", title: "Engagement Director", human: true }, { id: "role-custodian", title: "Evidence Custodian", human: true }] },
    data_boundary: { customer_portal: false, live_connectors: false, autonomous_actions: false, cross_engagement_training: false, prohibited: ["credentials", "CUI", "classified", "customer records"] },
    evidence: [{ id: evidenceId, status: "admitted", custodian: "role-custodian", classification: "synthetic_source_record", language: "en", content: "Synthetic source record for a bounded workflow.", sha256: sha256("Synthetic source record for a bounded workflow.") }],
    events: [], conflicts: [], findings: [],
    roi: { inputs: { monthly_volume: { value: 0, classification: "unknown" } } },
    reports: { en: { critical_statements: [] }, es: { critical_statements: [] } }
  };
}
