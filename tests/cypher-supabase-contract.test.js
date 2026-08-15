import { describe, expect, it } from "vitest";
import migration from "../supabase/migrations/20260815223458_cypher_commercial_v1.sql?raw";

describe("Supabase authority security contract", () => {
  it("enables RLS and explicit tenant policies for every new exposed table", () => {
    const tables = [...migration.matchAll(/create table public\.(cypher_[a-z_]+)/g)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThanOrEqual(16);
    expect(migration).toContain("alter table public.%I enable row level security");
    expect(migration).toContain("private.is_member(tenant_id)");
    expect(migration).toContain("private.has_write_role(tenant_id)");
  });
  it("contains no user_metadata authorization, dual writes or public bucket", () => {
    expect(migration).not.toMatch(/user_metadata|raw_user_meta_data/i);
    expect(migration).not.toMatch(/public\s*=\s*true/i);
    expect(migration).not.toMatch(/\b(d1|r2)\b/i);
  });
  it("hardens definer functions and atomically gates validation on bound artifacts", () => {
    expect(migration).toContain("security definer set search_path=''");
    expect(migration).toContain("revoke all on function private.finalize_validation");
    expect(migration).toContain("artifact_type='evidence_manifest'");
    expect(migration).toContain("artifact_type='validation_pdf'");
    expect(migration).toContain("v.evidence_manifest_hash");
    expect(migration).not.toMatch(/create or replace function private\.finalize_validation\([^)]*target_package_hash/);
    expect(migration.indexOf("insert into public.cypher_evidence_packages")).toBeLessThan(migration.indexOf("update public.cypher_documents set validated=true"));
  });
  it("routes relationship and delivery lifecycle changes through guarded RPCs", () => {
    expect(migration).toContain("private.transition_relationship");
    expect(migration).not.toMatch(/grant insert on[^;]*cypher_relationship_decisions/);
    expect(migration).toContain("attempt key required");
    expect(migration).toContain("destination id required");
    expect(migration).toContain("private.request_delivery");
    expect(migration).toContain("cypher_destination_receipts");
    expect(migration).toContain("grant insert on public.cypher_destination_receipts to service_role");
    expect(migration).not.toMatch(/grant insert on[^;]*public\.cypher_deliveries/);
    expect(migration).not.toContain("verified_hash=case when outcome='delivered' then source_hash");
  });
  it("uses immutable original keys and grants no Storage update or delete policy", () => {
    expect(migration).toContain("/original/[0-9a-f]{64}");
    expect(migration).not.toMatch(/create policy cypher_storage_(update|delete)/);
  });
  it("uses composite tenant foreign keys for cross-tenant business relations", () => {
    for (const relation of ["cypher_extraction_runs","cypher_relationships","cypher_exceptions","cypher_obligations","cypher_deliveries"])
      expect(migration).toContain(`create table public.${relation}`);
    expect((migration.match(/foreign key\(tenant_id,/g) || []).length).toBeGreaterThanOrEqual(12);
  });
});
