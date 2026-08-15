# Cypher Online migration plan

## Product decision

Cypher Online is the authoritative product. The Windows application remains a temporary pilot, export, and migration reference until customer acceptance is complete. Desktop activation codes do not authorize the online service.

## Capability disposition

| Desktop capability | Online disposition | Authority |
|---|---|---|
| PDF intake and immutable SHA-256 identity | Migrate to private object storage and tenant-scoped metadata | Secretary |
| OCR preparation, Azure extraction, OpenAI adjudication | Migrate to asynchronous processing jobs | Shikigami policy |
| Field review and personalized extraction templates | Migrate | Secretary / tenant admin |
| PO and invoice matching | Migrate | Tenant policy plus human validation |
| Duplicate relationship explanation | Migrate | System evidence plus secretary decision |
| Validation PDF and evidence manifest | Migrate and make mandatory | System plus validator |
| Store/vendor debt and 90-day resolution | Migrate | Secretary / supervisor |
| Vendor registry | Migrate and tenant-scope | Tenant admin |
| Dispatch queue and reports | Migrate | Secretary |
| Supervisor dashboard and audit export | Migrate | Supervisor |
| Excel output | Replace with generated exports; never use as the database | Authorized users |
| Local/network/OneDrive paths | Retire from settings | Optional export integration later |
| Azure/OpenAI/SMTP credentials | Remove from customer UI | Shikigami secrets only |
| Database vacuum, integrity, backups | Remove from customer UI | Managed infrastructure |
| Signed executable updater | Retire for online service | Continuous web deployment |
| Product-key activation and 100-code inventory | Legacy desktop only | Replaced by tenant subscriptions |
| Role PINs | Retire | Replaced by personal identities and memberships |
| Demo mode | Replace with a synthetic demonstration tenant | Shikigami admin |

## Online settings boundary

### Tenant administrators can manage

- Organization identity, currency, fiscal year, timezone, and language.
- Enabled document types and tenant-specific field templates.
- Auto-match and retroactive-match behavior.
- Resolution period and operational notification policy.
- Supplier normalization, aliases, stores, vendors, users, and roles.
- Report branding and authorized integrations.

### Individual users can manage

- Theme, font scale, table density, high contrast, locale, and notifications.
- Default dashboard view and saved filters.

### Shikigami controls

- Subscription, plan, entitlements, storage/document limits, and billing status.
- AI providers, models, routing, confidence floors, and cost protection.
- Secrets, backups, release management, observability, malware scanning, and incident controls.
- Minimum retention and audit requirements. Tenant settings may be stricter, never weaker.

## Delivery phases

1. **Platform foundation:** tenant authentication, subscriptions, operational schema, tenant settings, personal preferences, audit events.
2. **Document intake:** private object storage, hashing, upload sessions, file validation, malware gate, immutable artifact records.
3. **Processing:** queue-backed preprocessing and OCR, provider routing, extraction candidates, confidence, cost ledger, retry/dead-letter handling.
4. **Human review:** side-by-side document viewer, field correction, custom fields, validation authority, conflict explanations.
5. **Operational controls:** matching, duplicate relationships, stores, vendors, debt aging, resolutions, dispatch.
6. **Evidence and reporting:** validation PDFs, evidence manifests, Excel/CSV exports, supervisor audit, tenant backup exports.
7. **Enterprise administration:** invitations, MFA/SSO, store-scoped access, retention/legal holds, SharePoint integration, SLAs.
8. **Migration and acceptance:** desktop import utility, reconciliation report, AAP UAT, performance/security tests, controlled cutover.

## Added online-native features

- Personal approval inbox with aging and confidence prioritization.
- Live tenant activity timeline and explainable status history.
- Saved operational views by store, vendor, status, age, and reviewer.
- Tenant-level usage and document-volume visibility without exposing provider secrets.
- Feature entitlements that allow paid add-ons without issuing new software builds.
- Store-scoped memberships for future distributed operation while preserving secretary authority.

## Release gates

No real customer documents enter the online service until tenant isolation, private storage, backup restoration, audit integrity, provider authorization, retention terms, and customer acceptance are verified in staging.

## Execution ledger - 2026-08-04

| Phase | State | Evidence / remaining gate |
|---|---|---|
| 1. Platform foundation | Implemented and locally verified | Tenant/customer sessions, subscriptions, settings, WebAuthn administration, D1 tenant guards. Production D1 ID remains unset. |
| 2. Document intake | Implemented and locally verified | PDF signature and size checks, server SHA-256, R2 checksum, immutable artifact, exact-duplicate response, Queue job creation. Malware provider is still a production gate. |
| 3. Processing | Connected, disabled by default | Azure v4 prebuilt invoice adapter; low-confidence fallback to OpenAI Terra, then Sol; structured extraction; retry and final visible failure states. Provider secrets and AAP corpus approval remain gates. |
| 4. Human review | Partially implemented | Approval inbox, document metadata/original retrieval, required-field validation API and audit. Side-by-side field editor remains. |
| 5. Operational controls | Data services implemented | Tenant-scoped stores, vendors, exposure, resolutions and dispatch schema. Matching automation and complete UI remain. |
| 6. Evidence/reporting | Schema foundation only | Artifact model exists. Validation PDF, manifest signing, CSV/XLSX exports, and render QA remain. |
| 7. Enterprise administration | Security foundation implemented | Separate passkey console, owner-email allowlist, readiness view, dual-control support schema. Invitations/SSO/retention UI remain. |
| 8. Migration/acceptance | Not started | Desktop remains untouched as rollback source. Import rehearsal, AAP UAT, load test, restore drill, and controlled cutover remain. |

The online migration is therefore not represented as complete. The currently executable boundary is the secure platform and intake pipeline; customer go-live remains blocked by the explicit gates above.
