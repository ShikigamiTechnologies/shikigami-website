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
  ["Cypher legacy persistence bindings removed", !wrangler.includes('"binding":"CYPHER"') && !wrangler.includes('"binding":"CYPHER_FILES"') && !wrangler.includes('"binding":"CYPHER_JOBS"')],
  ["password migration fails closed over existing users", passwordMigration.includes("cypher_password_migration_guard") && passwordMigration.includes("COUNT(*) = 0")],
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
]);

const failures = required.filter(([, passed]) => !passed);
if (failures.length) {
  for (const [name] of failures) console.error(`FAIL: ${name}`);
  process.exitCode = 1;
} else {
  console.log(`Site checks passed (${required.length} assertions).`);
}
