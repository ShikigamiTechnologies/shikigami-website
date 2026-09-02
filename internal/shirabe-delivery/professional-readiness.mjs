export const REQUIRED_DISCIPLINES = ["legal", "privacy", "tax_accounting", "insurance", "security"];

export function validateProfessionalSignoffs(packet) {
  const errors = [];
  const reviews = new Map((packet?.reviews || []).map((item) => [item.discipline, item]));
  for (const discipline of REQUIRED_DISCIPLINES) {
    const review = reviews.get(discipline);
    if (!review) { errors.push(`review_missing:${discipline}`); continue; }
    if (!["pending", "approved", "approved_with_conditions", "rejected"].includes(review.status)) errors.push(`review_status_invalid:${discipline}`);
    if (review.status !== "pending") {
      for (const field of ["reviewer_name", "reviewer_qualification", "reviewed_at", "scope", "evidence_reference"]) {
        if (!review[field] || /placeholder|tbd|pending/i.test(String(review[field]))) errors.push(`signoff_evidence_missing:${discipline}:${field}`);
      }
      if (review.self_approved !== false) errors.push(`self_approval_prohibited:${discipline}`);
    }
  }
  return { passed: errors.length === 0 && [...reviews.values()].every((item) => ["approved", "approved_with_conditions"].includes(item.status)), errors, complete: errors.length === 0 && [...reviews.values()].every((item) => ["approved", "approved_with_conditions"].includes(item.status)) };
}

const pricePattern = /\$[\d,]+(?:–\$[\d,]+)?/g;
const requiredPairs = [
  ["Controlled diagnostic service", "Servicio diagnóstico controlado"],
  ["design-partner intake", "admisión de socios de diseño"],
  ["Not a chatbot", "No es un chatbot"],
  ["people decide", "las personas deciden"],
  ["Measured", "Medido"],
  ["Projected", "Proyectado"],
  ["Assumed", "Supuesto"],
  ["Unknown", "Desconocido"],
  ["SHIRABE does not", "SHIRABE no"],
  ["accepts no files", "No acepta archivos"]
];

export function auditPublicParity(enHtml, esHtml) {
  const errors = [];
  const enPrices = [...enHtml.matchAll(pricePattern)].map((item) => item[0]);
  const esPrices = [...esHtml.matchAll(pricePattern)].map((item) => item[0]);
  if (JSON.stringify(enPrices) !== JSON.stringify(esPrices)) errors.push("public_price_parity_mismatch");
  for (const [en, es] of requiredPairs) {
    if (!enHtml.toLowerCase().includes(en.toLowerCase())) errors.push(`public_en_concept_missing:${en}`);
    if (!esHtml.toLowerCase().includes(es.toLowerCase())) errors.push(`public_es_concept_missing:${es}`);
  }
  return { passed: errors.length === 0, errors, prices: enPrices };
}

export function evaluateDesignPartner(record) {
  const failures = [];
  const requireTrue = ["contract_executed", "scope_signed", "authority_bound", "engagement_completed", "package_verified", "restore_rehearsed", "deletion_or_retention_verified", "customer_acceptance_signed"];
  if (record?.evidence_kind !== "real_customer_engagement") failures.push("real_customer_evidence_required");
  for (const field of requireTrue) if (record?.[field] !== true) failures.push(`required_gate_failed:${field}`);
  if (!record?.evidence_manifest_hash || !/^[a-f0-9]{64}$/.test(record.evidence_manifest_hash)) failures.push("evidence_manifest_hash_required");
  if (!record?.customer_signoff_reference || /placeholder|tbd|pending/i.test(record.customer_signoff_reference)) failures.push("customer_signoff_evidence_required");
  if (Number(record?.material_findings_with_provenance_rate) !== 1) failures.push("provenance_must_equal_100_percent");
  if (Number(record?.authority_breaches) !== 0) failures.push("authority_breach_detected");
  if (Number(record?.silent_conflicts) !== 0) failures.push("silent_conflict_detected");
  if (Number(record?.severe_bilingual_divergences) !== 0) failures.push("severe_bilingual_divergence_detected");
  if (Number(record?.accepted_actionable_findings) < 2) failures.push("two_accepted_findings_required");
  if (Number(record?.validated_measurable_opportunities) < 1) failures.push("validated_opportunity_required");
  if (!Number.isFinite(Number(record?.delivery_hours)) || Number(record.delivery_hours) <= 0) failures.push("delivery_hours_required");
  if (!Number.isFinite(Number(record?.delivery_cost)) || Number(record.delivery_cost) <= 0) failures.push("delivery_cost_required");
  return { passed: failures.length === 0, failures };
}
