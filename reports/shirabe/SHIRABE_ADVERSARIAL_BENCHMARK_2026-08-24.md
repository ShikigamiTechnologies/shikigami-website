# SHIRABE Adversarial Intake Benchmark

Synthetic fictional composites only. No real agency, customer, employee, allegation, loss, or confidential record was used.

## Result

- Pre-repair code-audit baseline: **80/100**
- Post-repair minimum scenario score: **95/100**
- Post-repair mean scenario score: **98.4/100**
- English scenarios: **5**
- Spanish scenarios: **5**
- Terminal $10M loss scenarios: **2**, each retained as an unverified report

The baseline is a rubric-based audit of the pre-repair SHIRABE implementation, not a paid Microsoft product benchmark. Microsoft is used only as a reference architecture for process discovery, analytics, governance, and human oversight.

| Scenario | Language | Complexity | Score | Route | Deterministic signals |
|---|---:|---:|---:|---|---|
| EN-01 | EN | 1 | 95 | standard | workforce_constraint |
| EN-02 | EN | 2 | 98 | high_risk_governed_review | operational_disruption, restricted_evidence_boundary |
| EN-03 | EN | 3 | 100 | high_risk_governed_review | workforce_constraint, conflicting_evidence, restricted_evidence_boundary |
| EN-04 | EN | 4 | 99 | high_risk_governed_review | integrity_review_needed, conflicting_evidence, frequency_volume_conflict |
| EN-05 | EN | 5 | 100 | high_risk_governed_review | reported_financial_loss, high_material_loss, loss_not_independently_measured, integrity_review_needed, investigation_reported, workforce_constraint, conflicting_evidence, operational_disruption, restricted_evidence_boundary |
| ES-01 | ES | 1 | 95 | standard | workforce_constraint |
| ES-02 | ES | 2 | 98 | high_risk_governed_review | restricted_evidence_boundary |
| ES-03 | ES | 3 | 100 | high_risk_governed_review | conflicting_evidence, operational_disruption, restricted_evidence_boundary |
| ES-04 | ES | 4 | 99 | high_risk_governed_review | integrity_review_needed, investigation_reported, workforce_constraint, conflicting_evidence, operational_disruption |
| ES-05 | ES | 5 | 100 | high_risk_governed_review | reported_financial_loss, high_material_loss, loss_not_independently_measured, integrity_review_needed, investigation_reported, workforce_constraint, conflicting_evidence, operational_disruption, restricted_evidence_boundary |

## Permanent safety invariant

An intake may surface evidence conflicts, reported investigations, material-loss claims, workforce constraints, disruptions, and restricted-data boundaries. It must never infer guilt, fraud, misconduct, or causation from those indicators. High-risk cases route to governed human review.
