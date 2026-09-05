# SHIRABE release-boundary repair

The release checker no longer treats a caller-supplied Cloudflare version identifier and matching public asset as independent proof of active Worker source. It returns `verified_live_assets_only` where appropriate, keeps `runtime_source_binding_verified=false`, and holds `release_ready=false` until independent runtime/source attestation is implemented and verified.

Local verification: 113 Vitest tests passed across intake, adversarial benchmark, D1 integration and the 72-case bilingual negative-control prerequisite. One Node release-boundary test passed. The 72 cases are deterministic local negative controls, not 72 independent company scenarios or live provider executions.

No Worker, migration, secret, email or runtime configuration changed. No deployment is required by this repair. Browser-to-live-runtime, email retry, active version attestation and operational rollback are not qualified by these tests. Publish on a dedicated repair branch; no automatic main merge or production readiness claim.
