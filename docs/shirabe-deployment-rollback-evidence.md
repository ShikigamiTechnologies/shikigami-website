# SHIRABE deployment and rollback evidence contract

Status: local candidate; no deployment or promotion authorized.

## Deployment evidence required

Before a SHIRABE release can be promoted, bind one immutable packet to:

- Git commit SHA and clean-clone verification.
- Branch, signed tag or approved release identifier.
- `package-lock.json` SHA-256 and Node/npm versions.
- D1 database identifier and forward-only migration head.
- Cloudflare Worker version ID and deployment timestamp.
- Static-asset manifest, including the benchmark PDF SHA-256.
- `npm run verify:shirabe-release`, SHIRABE unit/integration/UI tests, site checks, secret scan, and Wrangler dry-run results.
- Synthetic production-route probes for intake, method rejection, administration-without-secret rejection, benchmark HTML, benchmark PDF, and sensitive-path denial.
- The exact non-secret variable names and binding names used. Secret values must never enter the packet.
- Named reviewer, owner approval record, and the approved public claims payload.

The scheduled reconciliation flag defaults to `false`. Activation requires a separately reviewed configuration payload and a new deployment receipt. Staging has no cron and must keep every API route disabled.

## Rollback evidence required

Before promotion, rehearse and record:

1. Previous known-good Git SHA and Cloudflare version ID.
2. Pre-migration D1 backup/export identifier and integrity hash.
3. Forward-fix plan for schema changes; never assume destructive down-migrations are safe.
4. Worker rollback to the previous version with route and asset probes.
5. Outbox behavior across rollback: no duplicate email, lost pending item, or replayed completed item.
6. Stale scheduled-claim recovery after rollback.
7. Benchmark PDF HTTP 200 and downloaded-hash verification after rollback.
8. Intake, routing, lifecycle-event, retention, and audit-record reconciliation.
9. Measured recovery time and recovery point.
10. Owner decision to remain rolled back, forward-fix, or stop service.

## Automatic stop conditions

- Unknown or dirty release SHA.
- Missing Cloudflare version or D1 migration receipt.
- Secret found in source, logs, artifacts, or configuration.
- Admin route succeeds without the approved secret.
- Staging executes any SHIRABE API or scheduled maintenance.
- Duplicate notification or unaccounted outbox item.
- Cross-engagement data exposure or provenance loss.
- Benchmark PDF missing or hash-mismatched.
- Backup cannot be restored into an isolated environment.

Passing local tests does not satisfy these external deployment and rollback gates.
