# SHIRABE Intake Contract v1

SHIRABE is Shikigami Technologies' bilingual evidence-to-opportunity diagnostic. It is a guided, bounded intake—not an unrestricted chatbot and not an approved business recommendation.

## Public promise

The intake helps an operator state what work is breaking, reconstruct the current workflow, identify the reported consequence, distinguish evidence from estimates, and describe a measurable outcome. The public result reports diagnostic completeness and evidence quality only. It never displays a fabricated opportunity or AI-fit score.

## Evidence boundary

All submitted statements enter as `owner/operator self-report · not independently verified`. The public intake accepts no files and explicitly prohibits passwords, credentials, customer records, health information, tax or banking data, CUI, classified information, and complete contracts. Prospect submissions never enter Obsidian or the Founder Vault. Only an approved, de-identified institutional finding may be projected later.

## Runtime lifecycle

1. The browser validates each conversational stage and keeps an unsubmitted draft in `sessionStorage` only.
2. The operator reviews the reconstructed summary and explicitly consents.
3. `POST /api/shirabe-intake` validates origin, content type, size, timing, schema, enumerations, lengths, and consent.
4. The Worker canonicalizes and SHA-256 hashes the complete intake.
5. D1 atomically inserts the immutable intake and one pending routing task.
6. Owner notification is attempted after persistence. Notification failure is recorded but does not destroy the accepted intake.
7. A future M.A.G.I. consumer may claim the routing task using a separately tested, single-claim protocol.

## M.A.G.I. distribution contract

- Deterministic gate: validation, consent, honeypot, schema, completeness, hash, and duplicate/replay controls.
- Local router: problem category, missing information, sensitivity, contradiction, and routing tier.
- Clarification path: incomplete or internally inconsistent submissions receive bounded follow-up.
- Qualified path: Codex/M.A.G.I. Prime may request a read-only Gemini company/market packet after governance checks.
- Ricardo inbox: every consequential next step awaits owner review.
- Claude: architecture only after a qualified problem and approved task contract.
- Hephaestus: isolated sandbox build and benchmark only after approval.
- Susanoo: adversarial requirement/evidence review before integration.
- Daybreak Blue: authorized internal security authority when technical access or sensitive systems justify it.

The complete council is not the default. It is reserved for material value, disagreement, regulated scope, security consequences, or a proposed implementation.

## Current implementation state

Implemented and tested in the isolated `feature/shirabe-intake-v1` branch:

- English and Spanish interface.
- Quick Signal and Guided Diagnostic modes.
- Five-stage dialogue and review-before-submit.
- Frequency/volume contradiction confirmation.
- Browser-only draft recovery.
- Upload-free sensitive-data boundary.
- Hash-bound D1 intake and atomic routing record.
- Owner notification with failure recording.
- Deterministic completeness and evidence-quality classification.

Not activated by this branch:

- Remote D1 migration.
- Production deployment or public traffic.
- M.A.G.I. routing worker claim/lease processing.
- Automated external research.
- Founder Vault projection.
- Paid diagnostic, sandbox, or customer-data workflow.
