# SHIRABE release-gate execution — 2026-09-08

## Outcome

Technical progress, not all seven gates completed. The original website repair a1410fb was reviewed and fast-forwarded to main. A newly reproduced notification-duplication defect is corrected locally, tested and prepared for merge. No deployment, production D1 write, real notification, customer contact or professional approval occurred during this run.

## Evidence

- Independent Claude reviews completed for original website verification code, the new Worker notification logic and selected Foundry core modules. All returned no blocking findings for their supplied source scope. Raw receipts retain provider/model/session and exact source hashes. An earlier Foundry attempt timed out and remains a recorded failure. This is not independent review of every file in both commits.
- Cloudflare authenticated content retrieval, bracketed by matching active-deployment queries, produced the same worker.js SHA256 as a local build of a1410fb: `d390ad5c9cd9fa990d36fffadb4a169c567c7e1ca5634c29ca0d708a5a626ee5`. Active version: `48cf1f56-ae6f-4f8f-af90-3c363139d9d8`. This proves point-in-time module byte equivalence, not a unique historical uploader commit or all assets/configuration.
- Red/green regression: successful email transport followed by failed D1 receipt caused two sends before the fix. The correction holds all uncertain post-dispatch outcomes and stale sending claims for owner review; only known pre-dispatch failure is automatically retryable. Missing/empty receipts and rejected sends cannot be counted as delivered. This favors avoiding duplicates over automatic eventual delivery; it does not promise exactly-once email delivery.
- Full website Vitest suite: 198 passed across 14 files. Includes concurrent identical submissions, uncertain delivery, safe retry, stale claims, routing, retention and existing regressions.
- Browser integration: two passing EN/ES journeys, desktop 1440x900 and mobile 390x844, no intercepted intake responses. Actual local Worker and local D1, deliberately simulated email transport. Verified duplicate replay, administrative completion and reconciliation. Tab focus and serious/critical WCAG A/AA automated checks passed; this is not a comprehensive accessibility or native-language audit.
- Delivery/professional-gate suite: 23 passed, including package tampering, isolated restore/deletion and rejection of synthetic customer evidence. This is not a cloud D1 disaster-recovery rehearsal.
- Twenty sequential live public page GETs: p50 102 ms, p95 272 ms, zero errors, against a preselected p95 3000 ms / zero-error sample threshold. No claim about full intake/D1/email transaction latency, global performance or an SLA.
- Completed reviewer receipts expose list-price estimates, not actual billing. Actual attributable cloud/provider costs remain unknown. No zero-cost claim.

## Internal dependency limitation

A separate internal repository needs a scoped backport and dependency qualification before its repair can merge. No whole-history merge or force-push was performed. Details remain in the private internal evidence packet; they do not qualify this public service.

## Independent-review corrections

Worker outputs remain untrusted evidence. One review incorrectly described D1 batch rollback; the official [D1 database documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) specifies transactional rollback on statement failure. Migration 0003 already contains UNIQUE payload_hash; new concurrent tests exercise that boundary. References to unrelated dirty Foundry work were excluded from the repair's scope.

## Remaining gates and exact authority

The delivery fix changes Worker behavior and needs exact candidate-SHA deployment approval before production activation. Live synthetic email verification, scoped administrative reconciliation, cloud rollback rehearsal, measured transaction p95/cost, real alert delivery and backup operator acknowledgment remain open. Do not run global reconciliation or destructive restore to simulate a pass.

See `internal/shirabe-delivery/reviews/RELEASE_GATE_PLAN_2026-09-08.md` for operator procedures, proposed monitoring thresholds, privacy/mailbox/backup retention checks and design-partner protocol. Named qualified legal/privacy/tax/accounting/insurance/security/bilingual signoffs and a consenting sponsor with real usefulness and willingness-to-pay evidence cannot be supplied by agents. These remain explicitly pending.

The generated gateway preparation scope was MIS-0F34404D32EE. The extended sequence and reports are execution records, not a retroactively frozen end-to-end acceptance campaign. This run does not qualify portfolio-wide activation or admission of durable memory.
