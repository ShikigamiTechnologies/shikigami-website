import { describe, expect, it } from "vitest";
import { comparativeCases } from "./fixtures/shirabe-comparative-cases.js";
import reportJson from "../reports/shirabe/SHIRABE_COMPARATIVE_QUALIFICATION_2026-09-02.json?raw";

describe("SHIRABE frozen comparative qualification",()=>{
  it("contains the three distinct synthetic evidence conditions",()=>{
    expect(comparativeCases.map(x=>x.id)).toEqual(["CASE-A-CLEAN-LOG","CASE-B-FRAGMENTED","CASE-C-BILINGUAL-RESTRICTED"]);
    expect(comparativeCases.every(x=>x.synthetic_only!==false)).toBe(true);
    expect(comparativeCases[0].event_rows).toHaveLength(12);
    expect(comparativeCases[1].event_rows.some(row=>row.some(value=>value==null))).toBe(true);
    expect(comparativeCases[2]).toMatchObject({language:"es",expected_events:0});
    expect(comparativeCases[2].rejected_sources).toHaveLength(1);
  });
  it("preserves source, conflict, correction, and restricted-data identities",()=>{
    for(const item of comparativeCases){expect(new Set(item.sources).size).toBe(item.sources.length);expect(item.conflicts.every(c=>c.sources.every(source=>item.sources.includes(source)))).toBe(true);}
    expect(comparativeCases[2].corrections[0]).toEqual({from:"C-INTERVIEW-V1",to:"C-INTERVIEW-V2"});
  });
  it("publishes losses, applicability, and unknowns without a superiority claim",()=>{
    const report=JSON.parse(reportJson);
    expect(report).toMatchObject({synthetic_only:true,external_uploads:0,paid_services:0,customer_data:0});
    expect(report.cases.map(x=>x.pm4py.applicability)).toEqual(["full","partial","not_applicable"]);
    expect(report.architecture_boundary).toMatchObject({intake:"self-report only",boundary_preserved:true});
    for(const item of report.cases.slice(1)){
      expect(item.shirabe.intake.native_claim_level_provenance).toBe(false);
      expect(item.shirabe.delivery).toMatchObject({validation_passed:true,material_provenance_rate:1,silent_conflicts:0});
      expect(item.shirabe.delivery.package).toMatchObject({created:true,verified:true,restored:true,deleted:true});
    }
    expect(report.cases[2].shirabe.delivery.corrections_preserved).toBe(1);
    expect(report.cases[2].shirabe.delivery).toMatchObject({
      corrections_input:1,
      correction_linkage_validated_by_current_validator:true,
      correction_negative_test_passed:true,
      evidence:expect.objectContaining({superseded:1})
    });
    expect(report.conclusions.map(x=>x.classification)).toEqual(expect.arrayContaining(["observation","hypothesis","unknown"]));
    expect(report.verdict).toContain("no_overall_superiority_claim");
  });
});
