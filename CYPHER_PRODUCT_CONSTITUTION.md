# Cypher Product Constitution

Status: canonical owner-directed product definition
Version: 2026-08-15
Owner: Ricardo Parra Pastor
Applies to: Foundry, M.A.G.I., Hephaestus, Cypher Online, future implementation workspaces

## Provenance rules

- Statements under **Owner directives** are `owner_statement` records. They define intended direction but are not implementation evidence.
- Statements under **Verified candidate state** are `repository_fact` records derived from the isolated Cypher release candidate based at commit `76052adfd193b738214bf939b147101f10608fe8`.
- Statements under **Target architecture** are `approved_design_direction` until implemented and tested.
- No agent may silently rewrite this product purpose, promote a target capability to a completed capability, or treat model output as an authorized financial decision.

## Five Ws and How

### What

Cypher is Shikigami Technologies' tenant-isolated online document-intelligence and operational-evidence platform. It turns difficult invoices, purchase orders, receipts, and related operational documents into traceable records that preserve the source, extraction, corrections, relationships, validation decision, and evidence history.

Cypher is not merely OCR and is not a payment engine.

### Why

Organizations need to know more than what words appear on a document. They need to know whether the document is duplicated, whether a PO was reused legitimately, whether invoice and PO totals and lines agree, which store and vendor own the exception, whether exposure is merely unresolved or actually confirmed, who corrected the record, and who authorized the final disposition.

### Who

- Primary operator: Regional Secretary or equivalent document-control operator.
- Additional authorized roles: tenant administrator, supervisor/reviewer, and bounded viewer.
- Customer profiles: multi-location businesses, government and fleet operations, procurement, construction, logistics, property operations, contract administration, and other document-heavy organizations.
- Final authority: an authenticated customer representative operating under the customer's policy.

### Where

- Primary system: authenticated Cypher Online tenant workspace.
- Authoritative cloud destination: private Supabase Postgres and Storage under tenant-scoped RLS.
- Approved secondary destination: a customer-designated export location after OCR/validation, subject to an explicit connector, user grant, delivery receipt, and hash verification.

### When

Cypher operates from intake through preservation, extraction, comparison, exception review, human validation, evidence generation, reporting, retention, and controlled export.

### How

1. Authenticate the tenant user and authorize the requested operation.
2. Validate and malware-screen the upload.
3. preserve the immutable original in private Supabase Storage.
4. Record its tenant, uploader, timestamp, MIME type, size, SHA-256 hash, and immutable object key in Postgres.
5. Dispatch an idempotent extraction job.
6. Run Azure Document Intelligence first, then approved OpenAI fallback models when defined escalation conditions are met.
7. Preserve provider, model/version, source grounding, confidence, structured output, cost, latency, and every extraction version.
8. Apply deterministic normalization, duplicate controls, PO/invoice/line matching, and exposure classification.
9. Route uncertainty and exceptions to the authorized reviewer.
10. Preserve every correction and final decision without modifying the original.
11. Generate a validation PDF and machine-readable evidence manifest.
12. Deliver an approved copy/export to the customer's designated destination and record a cryptographic delivery receipt.

## Owner directives

1. Cypher is migrating to an online hybrid operating model.
2. All source documents and Cypher records will be stored authoritatively in Supabase.
3. After OCR/validation, an approved copy or export will also be saved to the customer's designated destination.
4. The product remains human-governed: AI proposes, deterministic controls compare, and authorized people decide.
5. Foundry coordinates work, M.A.G.I. returns one governed recommendation, Hephaestus builds and benchmarks candidates in an isolated sandbox, and Susanoo challenges unsupported or unsafe conclusions.

## Authority model for hybrid storage

Supabase is the system of record. A customer destination is a verified delivery target, not an independent mutable authority.

Every delivered artifact must carry:

- Tenant ID and document ID.
- Artifact type and schema version.
- Source and artifact SHA-256 hashes.
- Validation version and decision state.
- Destination connector and destination object identifier.
- Delivery attempt, timestamp, status, and error.
- Verification timestamp and verified destination hash when supported.

The system must never silently reconcile conflicting customer copies back into the authoritative record.

## Browser and local-folder constraint

A web application cannot reliably write unattended files into an arbitrary customer folder without a user grant or installed synchronization component. The supported destination patterns are therefore:

1. Customer-approved cloud connector such as Google Drive, OneDrive/SharePoint, S3-compatible storage, or another documented API.
2. User-initiated browser download.
3. Browser File System Access permission where supported, with explicit user interaction and revocable permission.
4. A separately approved local synchronization agent if unattended local-folder delivery becomes mandatory.

No agent may promise automatic background local-folder saving while the product remains web-only and no supported connector or synchronization agent exists.

## Immutable product invariants

- One tenant cannot access another tenant's metadata, objects, searches, reports, URLs, jobs, or audit records.
- Original files are immutable and content-addressed.
- Supabase buckets remain private.
- Service-role credentials never reach the browser.
- AI output remains candidate evidence until authorized validation.
- Unmatched does not mean debt.
- Reused PO does not automatically mean duplicate, fraud, or error.
- Equal totals do not erase line-level variance.
- Reprocessing creates a new extraction version.
- Validation creates versioned evidence and never rewrites the original.
- Consequential actions remain approval-gated.
- Provider content and uploaded documents are untrusted input.
- Every external delivery is idempotent, attributable, and verifiable.
- No claim is shown as verified unless its evidence is materially available.

## Verified candidate state

The isolated candidate currently contains:

- Cloudflare Worker routes for tenant sessions, uploads, extraction, validation, evidence, CSV reporting, passkeys, and platform administration.
- D1 schemas and tenant guards.
- R2 private object storage.
- Cloudflare Queue and dead-letter configuration.
- Azure-first and OpenAI-fallback extraction code.
- Customer and administrative HTML/CSS/JavaScript.
- Fifteen passing Worker integration tests and seventeen passing site/foundation checks.

This state proves a D1/R2 candidate foundation. It does **not** prove the Supabase-authoritative target architecture, customer destination delivery, production provider accuracy, or production readiness.

## Definition of done

Cypher is ready for a controlled customer test only when:

- Supabase Auth, Postgres, Storage, and RLS are implemented and cross-tenant denial is proven.
- The D1/R2-to-Supabase disposition is explicit and no split-brain authority remains.
- Immutable storage, retention, deletion, legal-hold, backup, and restore behavior are tested.
- The destination-delivery contract is implemented for at least one approved destination and failure recovery is proven.
- Representative OCR and matching benchmarks meet approved thresholds.
- Malware, prompt-injection, malformed-file, quota, concurrency, provider-outage, dead-letter, and recovery tests pass.
- Human approval and evidence packages remain intact under every failure test.
- Accessibility, mobile/tablet, session, passkey, observability, cost, and support runbooks pass.
- M.A.G.I. independently validates the evidence and Ricardo approves the exact pilot payload.
