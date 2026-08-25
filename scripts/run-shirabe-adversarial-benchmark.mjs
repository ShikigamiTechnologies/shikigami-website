import { writeFile, mkdir } from "node:fs/promises";
import { assessShirabe, scoreDiagnosticCapability } from "../lib/shirabe-diagnostics.js";
import { shirabeScenarios } from "../tests/fixtures/shirabe-adversarial-scenarios.js";

const results = shirabeScenarios.map(({ id, language, complexity, payload }) => {
  const assessment = assessShirabe({ ...payload, claimed_loss_minor: Math.round(payload.claimed_loss_amount * 100) });
  return { id, language, complexity, score: scoreDiagnosticCapability(assessment).total, routing: assessment.routing_tier || "standard", signals: assessment.signals.map(({ code }) => code) };
});
const average = results.reduce((sum, item) => sum + item.score, 0) / results.length;
const summary = { schema: "shirabe-adversarial-benchmark/v1", synthetic_only: true, baseline_code_audit: 80, final_minimum: Math.min(...results.map(({ score }) => score)), final_average: average, scenarios: results };
await mkdir("reports/shirabe", { recursive: true });
await writeFile("reports/shirabe/SHIRABE_ADVERSARIAL_BENCHMARK_2026-08-24.json", `${JSON.stringify(summary, null, 2)}\n`);
const rows = results.map((item) => `| ${item.id} | ${item.language.toUpperCase()} | ${item.complexity} | ${item.score} | ${item.routing} | ${item.signals.join(", ")} |`).join("\n");
await writeFile("reports/shirabe/SHIRABE_ADVERSARIAL_BENCHMARK_2026-08-24.md", `# SHIRABE Adversarial Intake Benchmark\n\nSynthetic fictional composites only. No real agency, customer, employee, allegation, loss, or confidential record was used.\n\n## Result\n\n- Pre-repair code-audit baseline: **80/100**\n- Post-repair minimum scenario score: **${summary.final_minimum}/100**\n- Post-repair mean scenario score: **${average.toFixed(1)}/100**\n- English scenarios: **5**\n- Spanish scenarios: **5**\n- Terminal $10M loss scenarios: **2**, each retained as an unverified report\n\nThe baseline is a rubric-based audit of the pre-repair SHIRABE implementation, not a paid Microsoft product benchmark. Microsoft is used only as a reference architecture for process discovery, analytics, governance, and human oversight.\n\n| Scenario | Language | Complexity | Score | Route | Deterministic signals |\n|---|---:|---:|---:|---|---|\n${rows}\n\n## Permanent safety invariant\n\nAn intake may surface evidence conflicts, reported investigations, material-loss claims, workforce constraints, disruptions, and restricted-data boundaries. It must never infer guilt, fraud, misconduct, or causation from those indicators. High-risk cases route to governed human review.\n`);
console.log(JSON.stringify({ minimum: summary.final_minimum, average, scenarios: results.length }));
