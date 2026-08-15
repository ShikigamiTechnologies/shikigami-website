# Cypher Online go-live runbook

This runbook is intentionally fail-closed. Values marked **confirmation** require a deliberate Platform Owner decision and must never be committed to Git.

## 1. Provision staging resources

- Create a non-production D1 database and replace the placeholder `CYPHER` database ID in a staging Wrangler environment.
- Create private R2 bucket `cypher-private-files-staging`; prohibit public access.
- Create `cypher-document-jobs-staging` and its dead-letter queue.
- Apply `migrations/cypher/0001` through `0006`; export the empty post-migration schema as evidence.
- Configure Cloudflare Access for the administration paths in addition to the application passkey boundary.

## 2. Install secrets

Use Cloudflare secrets, never `vars`, files, source code, screenshots, or tickets.

- `CYPHER_AUTH_PEPPER`
- `PLATFORM_AUTH_PEPPER`
- `PLATFORM_BOOTSTRAP_TOKEN` - one-time, revoke immediately after passkey enrollment
- `PLATFORM_OWNER_EMAIL` - **confirmation: the owner email supplied by the user**
- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` and `AZURE_DOCUMENT_INTELLIGENCE_KEY`
- `OPENAI_API_KEY`
- Optional final provider: `SUPABASE_URL` and preferably `SUPABASE_SECRET_KEY` (the legacy service-role key is accepted only for transition)

## 3. Provider activation order

1. Leave all providers disabled while bindings and secrets are installed.
2. Run the AAP acceptance corpus against Azure v4 `prebuilt-invoice` and record field accuracy, latency, and failure modes.
3. Enable Azure with `CYPHER_AZURE_ENABLED=true`.
4. Test low-confidence/missing-identity escalation to `gpt-5.6-terra`, then `gpt-5.6-sol`; set `CYPHER_OPENAI_ENABLED=true` only after cost and accuracy acceptance.
5. Keep `CYPHER_SUPABASE_ENABLED=false`. At the last infrastructure review, set it to `true` and invoke the Platform Owner-only connection check. This check reveals status only, never the key.

## 4. Apple/iPhone passkey owner enrollment

1. Confirm the final HTTPS origin and `PLATFORM_OWNER_EMAIL`.
2. Open the Platform Admin sign-in page on a trusted computer and begin bootstrap with the one-time token.
3. Scan the passkey prompt with the owner's iPhone and complete Face ID.
4. Confirm the administrator is active, the credential is backed up, and a passkey-authenticated session can read readiness metadata.
5. Revoke/delete `PLATFORM_BOOTSTRAP_TOKEN`; verify a second bootstrap is rejected.
6. Enroll a separate recovery credential. Do not treat emailed codes or SMS as the primary second factor.

## 5. Required acceptance evidence

- Tenant-crossing inserts and reads fail at both API and database layers.
- Original PDFs are private, byte-identical after retrieval, and match recorded SHA-256.
- Exact duplicate PDF, duplicate invoice, and legitimate reused PO produce distinct outcomes.
- Provider timeout, 429, malformed output, missing R2 object, and dead-letter exhaustion leave visible review/error states.
- “Unmatched” is not counted as debt; only confirmed outstanding and overdue exposure is totaled.
- Validation PDF and evidence manifest render correctly and reproduce their recorded hashes.
- Backup export, restore into an empty environment, and reconciliation pass.
- Browser tests on current Safari/iPhone, Chrome, and Edge; accessibility and text scaling checks.
- Load test at agreed daily ingest and a 2x burst; queue drains within the agreed service objective.
- AAP signs the UAT checklist before production ingestion.

## 6. Production cutover

- Repeat provisioning with production resources and a production-specific secret set.
- Deploy a versioned Worker, run smoke tests with synthetic documents, and inspect structured logs.
- Provision the AAP tenant and named secretary/VPO accounts; never share accounts.
- Import desktop data through a dry-run reconciliation first. Preserve the desktop dataset read-only until the retention/cutover sign-off.
- Enable customer ingestion only after the Platform Owner records the final go-live approval.

## Rollback

- Disable tenant login and provider flags; do not delete customer data.
- Roll back the Worker version.
- Drain or pause new queue production and preserve failed messages/evidence.
- Restore D1/R2 from the last verified recovery point only after reconciliation approval.
