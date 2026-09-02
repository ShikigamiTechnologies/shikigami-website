# SHIRABE Cloudflare qualification AAR

Date: 2026-09-02  
Environment: production Worker and remote D1  
Owner authorization: exact payload approved in the controlling Codex task

## Outcome

The Cloudflare engineering gates in the approved payload passed. SHIRABE is qualified as a controlled production-runtime candidate for synthetic operation. This result does not authorize customers, billing, public promotion, unrestricted data, or a claim of professional or commercial validation.

## Released state

- Worker: `shikigami-tech`
- Worker version: `15191ae2-ac0b-4544-80ff-708766ae4185`
- Runtime source commit: `318edc7` (`Activate SHIRABE scheduled reconciliation`)
- Qualification-test commit: `ec6ddaa` (`Add opt-in SHIRABE production browser qualification`)
- Branch: `codex/shirabe-direction-a-production`
- D1 migration: `0005_shirabe_intake_reliability.sql` applied remotely
- Production schedule: `*/15 * * * *`
- Scheduled reconciliation flag: `true`
- `LEAD_HASH_PEPPER` and `SHIRABE_ADMIN_TOKEN`: configured as encrypted Worker secrets; values were neither printed nor committed

## Evidence

- Repository tests: 122/122 passed.
- Delivery and professional-boundary tests: 23/23 passed.
- Site checks: 25/25 assertions passed.
- Wrangler types check and production dry-run build passed.
- Missing and invalid admin bearer tokens both returned HTTP 401.
- Canonical English, Spanish, diagnostic, and evidence pages returned HTTP 200.
- `/.git/config` returned HTTP 404.
- Canonical benchmark PDF returned HTTP 200, 81,076 bytes, SHA-256 `867a2a494e7050a8c1c074e059e1c48bd323506fb188c9fe6cbfc9a2a3d2ce26`.
- Controlled retry `SHR-2E1AD65DB103A74A` was recovered by the first eligible production cron: `retry` to `delivered`, attempts 1 to 2, provider message ID present, error cleared.
- Real Chromium-to-Worker Spanish traversal returned HTTP 201 with synthetic receipt `SHR-755AE792C5B9DB75`, completeness 100, notification delivered, and provider message ID present.
- The live browser test is opt-in through `SHIRABE_LIVE_E2E=1`; ordinary runs skip it to prevent accidental production submissions.
- Local branch head and its remote tracking branch were identical after push; the working tree was clean before this AAR was added.

## Failures encountered and resolved

1. The first live browser submission returned HTTP 400 because automation completed before the four-second anti-bot interval. The protection was not weakened; the qualification test now waits until the existing browser timestamp satisfies the production invariant.
2. A final PDF probe used an abbreviated filename and returned HTTP 404. The canonical path recorded in the release-truth manifest was then verified successfully with the expected hash.
3. One D1 verification request returned Cloudflare error 7403 transiently. `wrangler whoami` confirmed the authorized account and an immediate bounded retry succeeded.

## Remaining human and market gates

- Legal and privacy review
- Tax and accounting review
- Insurance review
- Independent security review
- Independent bilingual review
- At least one real design partner providing customer-value and willingness-to-pay evidence
- Explicit owner approval for public promotion, customer intake, billing, or broader data handling

Until those gates close, describe SHIRABE as a controlled, evidence-bounded candidate with a qualified production runtime—not as a fully validated public service.
