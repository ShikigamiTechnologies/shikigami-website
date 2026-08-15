# Cypher Market and Readiness Review

Date: 2026-08-15
Method: read-only official-source research plus repository-derived candidate evidence
External actions: 0

## Executive conclusion

Cypher enters a mature market. OCR, invoice parsing, custom fields, line-item extraction, human review, duplicate detection, PO matching, approval workflows, dashboards, and audit trails already exist across major cloud and AP-automation vendors.

Cypher's credible wedge is narrower and stronger:

> Evidence-governed document operations for difficult, multi-location workflows where contextual PO reuse, line-level variance, uncertainty-versus-confirmed-exposure separation, tenant-specific fields, and human-signed evidence matter more than automatic payment execution.

Cypher should integrate with accounting/ERP/payment systems later rather than trying to replace them now.

## Competitive map

| Segment | Representative products | Established strengths | Implication for Cypher |
|---|---|---|---|
| Cloud document AI | Azure Document Intelligence, Google Document AI, Amazon Textract | Pretrained invoice extraction, tables and line items, custom schemas/models, confidence, asynchronous processing | Treat these as provider engines. Cypher must add workflow, evidence, comparison, governance, and measured routing above them. |
| Intelligent document processing | Rossum, ABBYY, Hyperscience, UiPath Document Understanding | Classification, extraction, review queues, automation, enterprise integrations | Cypher needs benchmarked exception handling, source grounding, reviewer analytics, and integration contracts to compete credibly. |
| AP automation | Stampli, Tipalti, BILL and similar platforms | Multi-channel intake, 2/3-way matching, routing, collaboration, ERP synchronization, vendor portals, payments, audit trails | Do not compete on global payment breadth. Compete on difficult-document evidence, operational context, deployment flexibility, and customer-specific control. |
| Document management | DocuWare, M-Files and similar systems | Retention, search, workflow, records management, integrations | Cypher needs explicit retention/legal-hold, backup/restore, search, and export guarantees. |

## What is not unique

- Invoice and receipt OCR.
- Header and line-item extraction.
- Custom extraction fields.
- Confidence thresholds and human review.
- Exact and semantic duplicate warnings.
- Two-way and three-way matching.
- Approval routing and audit logs.
- Private cloud document storage.
- Dashboards, CSV exports, and ERP integrations.

These are table stakes and must be measured, not marketed as a moat.

## Potentially distinctive combination

1. **Contextual reused-PO intelligence.** Reuse is explained with related store, invoice, date, and document evidence rather than automatically rejected.
2. **Uncertainty is not debt.** Unmatched, disputed, confirmed outstanding, overdue, duplicate, and cleared states remain distinct.
3. **Evidence chain from source to decision.** Immutable original, extraction versions, corrections, validation PDF, machine-readable manifest, and named human authority remain linked.
4. **Line-level truth despite matching totals.** A zero header difference does not suppress compensating line-item variance.
5. **Customer-defined operational fields.** Tenant-specific fleet, property, warranty, government, work-order, grant, or contract fields flow through extraction and review.
6. **Hybrid verified delivery.** Supabase remains authoritative while approved customer destinations receive attributable, hash-verifiable copies.
7. **Puerto Rico and bilingual operations specialization.** Spanish/English review, local implementation, and regional multi-location workflows can form a practical initial wedge after evidence exists.

## Required improvements

### P0 — Architecture and security

1. Replace the current D1/R2 authority with an explicit Supabase data plane, or formally retain D1/R2 for a narrowly defined edge function. Do not operate two authoritative ledgers.
2. Design tenant RLS for every table, view, function, and Storage object path; test authenticated cross-tenant denial.
3. Use private Storage buckets and short-lived authenticated delivery. Never expose the service role to browsers.
4. Because Supabase Storage does not provide S3 object versioning, use immutable versioned object keys, deny overwrite/delete by default, and maintain a separate artifact ledger and restore-tested backup.
5. Add upload quarantine, malware scanning, PDF polyglot/malformed-file defenses, decompression/page-count limits, and safe rendering.
6. Treat document text as untrusted. Prevent document-borne prompt instructions from changing extraction schemas, tools, destinations, or authorization.
7. Add append-only/tamper-evident audit chaining and periodic external verification of evidence hashes.
8. Define retention, deletion, legal hold, customer export, regional residency, incident response, breach handling, and vendor data-processing boundaries.

### P0 — Reliability and correctness

1. Implement an idempotent transactional outbox for upload, OCR jobs, evidence generation, and destination delivery.
2. Define replay-safe state transitions and unique idempotency keys for every queue message and provider request.
3. Add provider circuit breakers, time budgets, concurrency controls, quotas, dead-letter replay, and manual recovery.
4. Persist source grounding: page, bounding box/text span, provider confidence, normalized value, and original provider output for each extracted field.
5. Separate model confidence from calibrated field accuracy. Never interpret a raw model confidence as a proven probability.
6. Add deterministic tolerance policies by tenant/vendor/document type for header and line matching.
7. Add receipt/goods-received evidence before claiming complete three-way matching.
8. Make validation evidence generation atomic from the user's perspective: a document cannot display `validated` until every required artifact and hash is durable.

### P1 — Operator and commercial readiness

1. Build side-by-side source highlighting and keyboard-first correction.
2. Add reviewer assignment, escalation, comments, mention/notification, SLA, and acknowledgment states.
3. Measure review time, touchless rate, exception rate, correction rate by field/provider/vendor, rework, queue age, and cost per document.
4. Add bilingual Spanish/English UI and test extracted Spanish document fields.
5. Add a connector contract and implement one initial target: Google Drive, OneDrive/SharePoint, or S3-compatible storage. Arbitrary unattended local-folder writes require a separately approved sync agent.
6. Define an ERP/accounting export interface without enabling payment execution.
7. Add tenant onboarding, invitations, role administration, password/passkey recovery, session controls, support-access approvals, and offboarding.
8. Add WCAG 2.2 AA, tablet/mobile, large-document, and low-bandwidth acceptance tests.

### P2 — Defensibility

1. Build a versioned benchmark corpus from synthetic, licensed, anonymized, or expressly approved documents.
2. Capture correction feedback as labeled evidence without silently training on customer data.
3. Calibrate provider routing by document class, quality, field, cost, and latency.
4. Publish narrow reliability evidence: extraction F1 by field, exact-match rates, line reconciliation accuracy, review-time reduction, failure recovery, and provenance completeness.
5. Create reusable customer workflow templates while keeping tenant-specific policy and data isolated.

## Minimum controlled-test benchmark

### Dataset

- At least 300 documents before pilot claims: 100 invoices, 75 POs, 50 receipts/support records, 50 degraded scans, and 25 adversarial/malformed cases.
- At least 10 vendors, 10 locations, Spanish and English, multiple layouts, handwriting/signatures, rotations, low resolution, duplicate scans, repeated invoice numbers, reused POs, partial invoices, and compensating line variance.
- A frozen 70/15/15 development, validation, and holdout split.

### Initial acceptance thresholds

These are proposed engineering thresholds and require owner approval before becoming contractual claims.

- 100% tenant-isolation and authorization tests pass.
- 100% original hashes and required provenance fields preserved.
- 0 unauthorized or unrecorded destination deliveries.
- 0 documents shown as validated without complete evidence artifacts.
- At least 99% exact accuracy on deterministic totals/currency after human-confirmed ground truth.
- At least 95% exact accuracy on invoice number, PO number, vendor, store, and date across the holdout set, reported separately per field.
- At least 98% precision and 95% recall for exact-file duplicates.
- At least 95% precision for duplicate-invoice and reused-PO candidate warnings; never automatic rejection.
- 100% detection of seeded total and line-item variance cases.
- P95 upload-to-review-ready latency below 90 seconds for documents within the pilot size envelope, excluding declared provider outages.
- 100% recovery of seeded queue/provider failures without duplicate records or lost originals.
- Restore drill meets approved RPO/RTO before customer documents are accepted.

## Test and debugging sequence

1. Freeze the constitution, state machine, data dictionary, threat model, and acceptance thresholds.
2. Design Supabase schemas, Storage paths, RLS, auth claims, audit ledger, and destination-delivery ledger.
3. Apply migrations to disposable environments and prove fresh install, upgrade, rollback/forward-fix, cross-tenant denial, and backup/restore.
4. Port upload and immutable preservation; test malformed, oversized, encrypted, polyglot, duplicate, interrupted, and concurrent uploads.
5. Port provider processing and source grounding; run accuracy, timeout, fallback, malformed-output, prompt-injection, quota, and cost tests.
6. Port deterministic matching/exposure; test reused PO, duplicate invoice, partial invoice, receipt, compensating line variance, currency, rounding, and aging boundaries.
7. Port review and validation; prove role enforcement, concurrent edits, stale approvals, complete evidence, revalidation versions, and audit integrity.
8. Implement one customer destination connector; test consent, revocation, idempotency, destination outage, hash mismatch, duplicate delivery, rename, and recovery.
9. Run accessibility, tablet/mobile, low-bandwidth, load, soak, observability, incident, and support-access tests.
10. Run a closed controlled pilot using non-confidential or expressly approved data. M.A.G.I. reviews one evidence package and Ricardo approves the next gate.

## Hephaestus autonomous sandbox scope

Hephaestus may:

- Generate safe synthetic benchmark documents and ground truth.
- Draft Supabase schemas, RLS policies, storage-path contracts, state machines, and migration tests in an isolated workspace.
- Build provider mocks, failure injectors, benchmark runners, and destination-connector simulators.
- Run tests against local/disposable resources with no customer data and no paid activation.
- Produce patches, evidence, latency/cost estimates, and a proposed approval payload.

Hephaestus may not:

- Apply production migrations or secrets.
- Upload customer documents.
- Enable a paid provider or connector.
- Send external communications.
- Modify the protected recovery checkout.
- Merge, deploy, or represent a sandbox result as production evidence.

## Decisions requiring Ricardo

1. Confirm Supabase as the sole authoritative metadata and object store.
2. Select the first supported customer destination connector.
3. Decide whether unattended arbitrary local-folder delivery justifies a separate sync agent.
4. Approve retention, deletion, legal-hold, regional residency, and backup objectives.
5. Approve benchmark thresholds and any sanitized/approved pilot dataset.
6. Approve paid provider use, remote migrations, staging activation, customer onboarding, and production deployment.

## Official research references

- Microsoft Azure Document Intelligence custom models: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/train/custom-model?view=doc-intel-4.0.0
- Google Document AI processor list: https://docs.cloud.google.com/document-ai/docs/processors-list
- Google Document AI extraction overview: https://docs.cloud.google.com/document-ai/docs/extracting-overview
- Amazon Textract AnalyzeExpense: https://docs.aws.amazon.com/textract/latest/APIReference/API_AnalyzeExpense.html
- Stampli AP Automation Platform: https://www.stampli.com/ap-automation-platform/
- Tipalti AP Automation: https://tipalti.com/ap-automation/
- Supabase Storage: https://supabase.com/docs/guides/storage
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase S3 compatibility and versioning limitation: https://supabase.com/docs/guides/storage/s3/compatibility
