# SHIRABE operational and customer gate plan

## Named responsibility — owner confirmation required

Proposed accountable operator: Ricardo, with a named backup operator still required. Automation may observe and prepare evidence but cannot accept risk, sign a professional review, contact a prospect, or approve its own release. Do not represent this proposed assignment as an accepted on-call commitment.

## Technical incident procedure

1. Identify the exact active Worker version and source-content digest; record UTC time and affected synthetic reference IDs. Do not copy customer payloads into logs or review prompts.
2. If a send was attempted but no durable receipt exists, hold the outbox entry in `dead` with `delivery_outcome_uncertain_owner_review_required`. Do not reset it to retry. Investigate the mail provider and owner mailbox first. A missing transport before dispatch can retry; a network exception after dispatch cannot prove non-delivery.
3. Before any live remediation, approve exact Worker version, selected reference IDs, SQL/action payload, rollback target and recipient. Global reconciliation can touch unrelated rows and is not a scoped synthetic cleanup operation.
4. Record incident ownership, disposition and evidence. A send acknowledgment is not mailbox delivery proof. An ambiguous result stays unknown.
5. Application rollback does not roll back D1. Require compatible schema, named snapshot/export and a verified isolated restore. Never rehearse destructive restore on production customer data.

## Monitoring acceptance thresholds (proposed launch gate)

- Public EN/ES pages: bounded probes, p95 <= 3000 ms and zero errors in the initial 20-request sample. Report cold/warm observations and sample origin; this is not an SLA.
- Approved synthetic intake: zero unexpected 5xx, p95 <= 3000 ms across at least 20 submissions in isolated staging; record D1, notification and reconciliation timing separately. Avoid defeating production rate limiting to collect a benchmark.
- Zero duplicate persisted intakes and zero automatic re-sends after uncertain delivery. Zero pending jobs without an accountable disposition.
- Alert on failed/uncertain notifications and missed reconciliation runs. Observability configuration is not proof that an alert reaches an on-call person. Alert destination, acknowledgment window and backup must be approved and rehearsed.
- Actual cloud and provider costs must be attributed to the test window. List-price model estimates and unknown incremental subscription costs are not invoices or zero cost.

## Privacy and professional safeguards

Review `SIGNOFF_MATRIX.md` and attach named, qualified, dated evidence for legal, privacy, tax/accounting, insurance, independent security and bilingual semantics. All remain pending until real reviewers supply evidence. Confirm intake retention, hash tombstone retention, mailbox copies, backups, deletion procedures and access ownership; database deletion alone is not complete erasure.

## Design-partner protocol — prepared, not recruited

One consenting organization, one explicitly bounded workflow, named sponsor, agreed data boundary and written scope. Start with a baseline measured by the sponsor; do not substitute synthetic results. Evaluate usefulness, correction burden, operator time, decision traceability and acceptance of the final deliverable. Record adverse evidence and reasons for no-change recommendations.

Before engagement, approve exact participant, invitation, price, deliverables, data authorization and stop conditions. Ask willingness-to-pay at a specific stated price after the sponsor sees the deliverable; a positive conversation is not a purchase. Distinguish stated intent, signed pilot, payment and renewal. No sponsor or actual commercial evidence exists in this technical run.

## Exact next live-test scope to approve after commit review

Two clearly marked synthetic intakes (one EN, one ES), destination `tengen@shikigamitechnologies.com`, no customer data, no provider activation and no global purge/reconciliation. The final payloads and candidate SHA must be shown before execution. Mail receipt verification and narrowly scoped cleanup require their own explicit target IDs; no blind resend is allowed. Production fault injection remains prohibited.
