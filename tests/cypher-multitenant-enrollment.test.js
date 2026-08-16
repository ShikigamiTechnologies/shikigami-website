import {describe,expect,it} from "vitest";
import migration from "../supabase/migrations/20260816144452_cypher_multitenant_enrollment.sql?raw";
import adapter from "../lib/cypher-supabase-adapter.js?raw";

describe("Cypher multi-tenant enrollment contract",()=>{
  it("labels Advance Auto Parts as synthetic and never as a customer",()=>{
    expect(migration).toContain("Advance Auto Parts — Synthetic Pilot");
    expect(adapter).toContain('classification:"synthetic_pilot"');
  });
  it("requires confirmed email and an active Supabase session",()=>{
    expect(migration).toContain("not private.active_session()");
    expect(migration).toContain("email_confirmed_at");
    expect(migration).not.toMatch(/user_metadata|raw_user_meta_data/i);
  });
  it("keeps the privileged claim implementation private",()=>{
    expect(migration).toContain("private.cypher_claim_pilot_membership");
    expect(migration).toContain("public.cypher_claim_pilot_membership");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("from public,anon");
  });
  it("binds login to the selected active tenant membership",()=>{
    expect(adapter).toContain("cypher_tenants.slug=eq.");
    expect(adapter).toContain("status=eq.active");
    expect(adapter).toContain("Your email must be confirmed and authorized");
  });
});
