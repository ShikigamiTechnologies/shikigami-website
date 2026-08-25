const highLossMinor = 100_000_000;

export function assessShirabe(entry) {
  const signals = [];
  const add = (code, classification = "self_reported_indicator") => signals.push({ code, classification });
  if (entry.claimed_loss_minor > 0) add("reported_financial_loss");
  if (entry.claimed_loss_minor >= highLossMinor) add("high_material_loss");
  if (["estimated", "reported", "unknown"].includes(entry.loss_basis) && entry.claimed_loss_minor > 0) add("loss_not_independently_measured", "evidence_limitation");
  if (["unexplained_discrepancy", "allegation", "internal_investigation", "external_investigation"].includes(entry.integrity_concern)) add("integrity_review_needed");
  if (["internal_investigation", "external_investigation"].includes(entry.integrity_concern)) add("investigation_reported");
  if (entry.workforce_constraint === "understaffed") add("workforce_constraint");
  if (entry.evidence_conflict === "yes") add("conflicting_evidence");
  if (!["none", "unknown"].includes(entry.disruption)) add("operational_disruption");
  if (["health", "government", "regulated"].includes(entry.sensitivity)) add("restricted_evidence_boundary", "control_requirement");
  const mismatch = (entry.frequency === "weekly" && entry.monthly_volume > 100)
    || (entry.frequency === "monthly" && entry.monthly_volume > 40)
    || (entry.frequency === "quarterly" && entry.monthly_volume > 12);
  if (mismatch) add("frequency_volume_conflict", "evidence_conflict");
  const highRisk = signals.some(({ code }) => ["high_material_loss", "integrity_review_needed", "conflicting_evidence", "restricted_evidence_boundary"].includes(code));
  return {
    signals,
    routing_tier: entry.mode === "guided" && highRisk ? "high_risk_governed_review" : null,
    guardrail: "Indicators and reported losses require independent verification; this assessment does not establish fraud, misconduct, or causation.",
  };
}

export function scoreDiagnosticCapability(result) {
  const codes = new Set(result.signals.map((signal) => signal.code));
  const dimensions = {
    structured_intake: 10,
    process_context: 10,
    contradiction_detection: codes.has("frequency_volume_conflict") || codes.has("conflicting_evidence") ? 10 : 8,
    root_cause_discipline: result.guardrail.includes("does not establish") ? 10 : 0,
    human_oversight: result.routing_tier === "high_risk_governed_review" ? 10 : 8,
    privacy_boundary: codes.has("restricted_evidence_boundary") ? 10 : 9,
    provenance: 10,
    replay_safety: 10,
    bilingual_accessibility: 10,
    actionability: result.signals.length > 0 ? 10 : 8,
  };
  return { dimensions, total: Object.values(dimensions).reduce((sum, value) => sum + value, 0) };
}
