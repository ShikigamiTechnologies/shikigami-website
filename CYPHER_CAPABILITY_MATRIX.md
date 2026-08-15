# Cypher Online Capability Matrix

Updated: 2026-08-06

## Live

- Tenant-isolated customer workspaces and role-scoped sessions
- Private PDF intake, SHA-256 hashing, R2 preservation, and exact-file duplicate rejection
- Azure Document Intelligence extraction with Terra then Sol escalation
- Structured extraction evidence, provider/model provenance, and confidence
- Store and vendor normalization
- PO/invoice total comparison, line-item persistence, and pricing-variance detection
- Duplicate-invoice and reused-PO relationship explanations
- Secretary field-by-field review and validation decisions
- Validation PDF and evidence-manifest generation
- Unmatched, disputed, confirmed-outstanding, overdue, and cleared exposure separation
- Configurable resolution age and automatic aging refresh
- Store and vendor operational tables
- Tenant-defined custom extraction fields
- Excel-compatible document-register export
- Platform audit events and private evidence downloads

## Partially implemented

- Retroactive matching is configurable, but historical reprocessing is not yet scheduled automatically.
- Weekly summaries are configurable, but outbound delivery is not enabled.
- CSV exports open in Excel; native XLSX packaging is a future enhancement.
- Store-aware cloud relocation runs after successful extraction; files whose store cannot be confirmed remain under `PENDING`.

## Ready for the next build

- Supervisor resolution assignment and completion UI
- Native XLSX workbooks with dashboards and charts
- Bulk intake and controlled batch validation
- Versioned validation history comparison
- Tenant-specific report branding assets

## Future integration

- Optional local synchronization agent
- SharePoint, OneDrive, and approved email intake
- ERP/accounting connectors
- Customer-managed storage and private-cloud deployment
- Supabase production migration after final authorization
- Billing automation and self-service tenant provisioning

## Public-claim rule

Public pages may describe only Live capabilities as generally available. Partial or future capabilities must be labeled explicitly and must not appear as completed functionality.
