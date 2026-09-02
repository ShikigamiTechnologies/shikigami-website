import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const page = await readFile(resolve(root, "kizuna.html"), "utf8");
const home = await readFile(resolve(root, "index.html"), "utf8");
const worker = await readFile(resolve(root, "worker.js"), "utf8");
const wrangler = await readFile(resolve(root, "wrangler.jsonc"), "utf8");
const cypher = await readFile(resolve(root, "cypher.html"), "utf8");
const cypherApp = await readFile(resolve(root, "cypher-app.html"), "utf8");
const passwordMigration = await readFile(resolve(root, "migrations/cypher/0007_cloudflare_password_policy.sql"), "utf8");
const shirabeService = await readFile(resolve(root, "services/shirabe/index.html"), "utf8");
const shirabeServiceEs = await readFile(resolve(root, "es/servicios/shirabe/index.html"), "utf8");
const shirabeEvidence = await readFile(resolve(root, "evidence/shirabe-synthetic-benchmark/index.html"), "utf8");
const shirabeComparison = await readFile(resolve(root, "research/shirabe-process-diagnostic-comparison/index.html"), "utf8");

const required = [
  ['canonical Kizuna URL', page.includes('href="https://shikigamitechnologies.com/kizuna"')],
  ["accessible estimator status", page.includes('aria-live="polite"')],
  ["pricing version disclosure", page.includes("v2026-07-29")],
  ["operating flow presentation", page.includes('class="flow-row"')],
  ["vertical package presentation", page.includes('id="industries"')],
  ["human authority boundary", page.includes('class="governance"')],
  ["controlled pilot call to action", page.includes('id="pilot"')],
  ["homepage product entry", home.includes('href="kizuna.html"')],
  ["sitemap entry", worker.includes('"/kizuna"')],
  ["staging API gate", worker.includes("Provider APIs are disabled in public staging")],
  ["Cypher controlled-staging positioning", cypher.includes("CONTROLLED STAGING · PILOT PREPARATION")],
  ["Cypher human approval boundary", cypher.includes("holds the result for a person to confirm")],
  ["Cypher production-claim disclaimer", cypher.includes("nothing on this page describes verified production performance or customer results")],
  ["Cypher customer application entry", cypherApp.includes('src="assets/js/cypher-app.js"')],
  ["site-wide Worker security headers", worker.includes("upgrade-insecure-requests") && worker.includes('"x-frame-options": "DENY"')],
  ["Worker-first static security wrapper", wrangler.includes('"run_worker_first": true')],
  ["production Supabase authority is not localhost", wrangler.includes('"SUPABASE_URL": "https://svfdvbtqbaiyefcojroe.supabase.co"') && wrangler.includes('"SUPABASE_PROJECT_ORIGIN": "https://svfdvbtqbaiyefcojroe.supabase.co"') && !wrangler.includes('"SUPABASE_URL": "http://127.0.0.1')],
  ["Cypher legacy persistence bindings removed", !wrangler.includes('"binding":"CYPHER"') && !wrangler.includes('"binding":"CYPHER_FILES"') && !wrangler.includes('"binding":"CYPHER_JOBS"')],
  ["password migration fails closed over existing users", passwordMigration.includes("cypher_password_migration_guard") && passwordMigration.includes("COUNT(*) = 0")],
  ["SHIRABE service is separate from commercial products", home.includes('id="services"') && home.includes('href="/services/shirabe/"')],
  ["SHIRABE English and Spanish service canonicals", shirabeService.includes('rel="canonical"') && shirabeService.includes('hreflang="es"') && shirabeServiceEs.includes('hreflang="en"')],
  ["SHIRABE service routes to governed intake", shirabeService.includes('href="/shirabe"') && shirabeServiceEs.includes('href="/shirabe?lang=es"')],
  ["SHIRABE synthetic benchmark is explicitly limited", shirabeEvidence.includes("synthetic internal") && shirabeEvidence.includes("do not establish customer outcomes")],
  ["SHIRABE comparison includes source freshness", shirabeComparison.includes("LAST VERIFIED") && shirabeComparison.includes("Not apples-to-apples")],
  ["SHIRABE sitemap routes", worker.includes('"/services/shirabe/"') && worker.includes('"/es/evidencia/benchmark-sintetico-shirabe/"')],
  ["SHIRABE Claude ten-step rail parity", (shirabeService.match(/class="process-step"/g) || []).length === 10 && (shirabeServiceEs.match(/class="process-step"/g) || []).length === 10],
  ["SHIRABE progressive motion script", shirabeService.includes('assets/js/shirabe-page.js') && shirabeServiceEs.includes('assets/js/shirabe-page.js')],
  ["SHIRABE five-state anchors", ["bridge", "method", "boundary", "evidence", "offer"].every((id) => shirabeService.includes(`id="${id}"`))],
  ["SHIRABE unsupported duration removed", !shirabeService.includes("8–12") && !shirabeServiceEs.includes("8–12")],
];

await Promise.all([
  access(resolve(root, "assets/css/kizuna.css")),
  access(resolve(root, "assets/js/kizuna.js")),
  access(resolve(root, "assets/css/cypher-online.css")),
  access(resolve(root, "assets/css/cypher-portal.css")),
  access(resolve(root, "assets/js/cypher-admin.js")),
  access(resolve(root, "assets/js/cypher-app.js")),
  access(resolve(root, "assets/js/cypher-auth.js")),
  access(resolve(root, "assets/js/cypher-passkey.js")),
  access(resolve(root, "assets/css/shirabe-intake.css")),
  access(resolve(root, "assets/css/shirabe.css")),
  access(resolve(root, "assets/js/shirabe-page.js")),
  access(resolve(root, "assets/docs/shirabe/SHIRABE_SYNTHETIC_BENCHMARK_REPORT_2026-08-25.pdf")),
]);

const failures = required.filter(([, passed]) => !passed);
if (failures.length) {
  for (const [name] of failures) console.error(`FAIL: ${name}`);
  process.exitCode = 1;
} else {
  console.log(`Site checks passed (${required.length} assertions).`);
}
