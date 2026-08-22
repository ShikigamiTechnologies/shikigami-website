# Cypher Batch C local evidence

Date: 2026-08-15

## Scope and verdict

- Emulator and local Supabase verification: **PASS**.
- Live Drive, SharePoint/OneDrive, SFTP, webhook, customer object storage: **BLOCKED** by design. No exact approval/grant was supplied and no external request was made.
- Production, customer, deploy, push, merge: **NOT TOUCHED**.

## Implemented

- Private Storage verification uses the local Supabase official HTTP API with an authenticated user JWT (`POST` upload, `HEAD`, version-bound streamed `GET`). The integration creates a synthetic authenticated upload intent, uploads exact bytes to the private bucket at the tenant/intent-bound path, computes SHA-256/size from the downloaded response, and performs a second HEAD race check.
- Object paths are bound to tenant and intent. Missing, truncation, size/digest mismatch, race/swap and cross-tenant paths never invoke database finalization.
- Storage policy and `private.cypher_commit_verified_upload` now enforce the identical canonical path `tenant-uuid/upload-intent-uuid/original/lowercase-64-hex.safe-extension`; the filename hash must equal the verified digest. Traversal, alternate directories, uppercase hash, hash mismatch, and extra suffix attacks are rejected in pgTAP and the actual Storage integration.
- `private.cypher_commit_verified_upload` inserts the service-only immutable receipt and calls document/audit/outbox finalization in one PostgreSQL transaction. It is executable only by `service_role`.
- Local emulators cover Drive, SharePoint, OneDrive, SFTP, webhook and customer object storage. Each emulator independently reads destination bytes after writing; only matching readback produces `delivered_verified`, while missing digest produces `delivered_unverified`. Dispatcher behavior includes stable job idempotency, lost-response recovery, overwrite/partial rejection, bounded retry and cancellation.
- Ledger and adapter replay receipts immutably bind tenant ID, exact destination kind/path, source digest, payload size, stable job identity, and idempotency key in one request fingerprint. Reusing a key with any differing immutable field returns `idempotency_conflict` before returning a receipt or creating another object.
- Live adapters require the literal approval token plus a write grant and remain unavailable in this sandbox.
- ExcelJS and its vulnerable dependency chain were removed. XLSX output is minimal OOXML generated with pinned JSZip 3.10.1 and is reopened/inspected as ZIP/XML in tests.

## Verification

- `npm test`: **PASS**, 5 files / 54 tests, including direct ledger-replay and adapter-replay conflict attacks.
- `npm run check`: **PASS**, including site checks, JavaScript syntax and Wrangler types.
- `npm audit --omit=dev`: **PASS**, 0 vulnerabilities.
- `npx supabase db reset --local`: **PASS**, all four migrations applied including Batch C.
- `npm run supabase:test-storage`: **PASS**, authenticated private Storage upload/HEAD/streamed GET/re-HEAD and atomic receipt/document/audit/outbox commit; anonymous read denied.
- `npx supabase test db`: **PASS**, 42 pgTAP tests, including service-role direct INSERT/UPDATE/DELETE bypass denial and five canonical-path attacks.
- `npx supabase db lint --local --level warning --fail-on error`: **PASS**, no schema errors.
- Static secret scan over runtime/config/tests: **PASS**, no service-role key, client secret or private key literals.
- Active dependency/lock scan: **PASS**, no ExcelJS package in the manifest, lockfile, commitment, or runtime dependencies. The 300-artifact OCR and OOXML reopen/bounds/formula gates pass, and two consecutive freezes produce commitment SHA-256 `c86b822384460be58e0f7bdb97597c6eab2de51990fcc61874920605597ce9b3`.

## Evidence boundary

The tests exercise deterministic local adapters and a local Supabase stack only. OAuth expiry/revocation/scope, host-key pinning, SSRF endpoint rejection, overwrite denial, partial digest mismatch, cancellation, replay/idempotency and verified/unverified status are emulator assertions, not claims about any live provider tenant.
