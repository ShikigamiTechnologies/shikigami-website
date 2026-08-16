import { afterEach, describe, expect, it, vi } from "vitest";
import { drainCypherOutbox } from "../lib/cypher-outbox-worker.js";

afterEach(() => vi.unstubAllGlobals());

describe("Cypher Supabase outbox worker", () => {
  it("claims, executes and completes a synthetic extraction", async () => {
    const calls=[];
    vi.stubGlobal("fetch",vi.fn(async (url,init)=>{
      const name=String(url).split("/").pop();calls.push([name,JSON.parse(init.body)]);
      const body=name==="cypher_claim_outbox"?[{id:"11111111-1111-4111-8111-111111111111",topic:"extract",aggregate_id:"22222222-2222-4222-8222-222222222222"}]:name==="cypher_run_extraction"?"33333333-3333-4333-8333-333333333333":null;
      return new Response(body===null?"":JSON.stringify(body),{status:200});
    }));
    const result=await drainCypherOutbox({SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"server-secret",CYPHER_STAGING_MODE:"synthetic_only"},1);
    expect(result).toEqual([{id:"11111111-1111-4111-8111-111111111111",topic:"extract",status:"completed"}]);
    expect(calls.map(([name])=>name)).toEqual(["cypher_claim_outbox","cypher_run_extraction","cypher_complete_outbox"]);
  });

  it("records bounded failure for an unauthorized topic", async () => {
    vi.stubGlobal("fetch",vi.fn(async (url,init)=>{
      const name=String(url).split("/").pop();
      if(name==="cypher_claim_outbox")return new Response(JSON.stringify([{id:"11111111-1111-4111-8111-111111111111",topic:"export",aggregate_id:"22222222-2222-4222-8222-222222222222"}]),{status:200});
      if(name==="cypher_fail_outbox")return new Response(JSON.stringify("retrying"),{status:200});
      throw new Error(`unexpected ${name} ${init.body}`);
    }));
    const result=await drainCypherOutbox({SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"server-secret",CYPHER_STAGING_MODE:"synthetic_only"},1);
    expect(result[0].status).toBe("retrying");
  });
});
