import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const page = await readFile(resolve(root, "kizuna.html"), "utf8");
const home = await readFile(resolve(root, "index.html"), "utf8");
const worker = await readFile(resolve(root, "worker.js"), "utf8");

const required = [
  ['canonical Kizuna URL', page.includes('href="https://shikigamitechnologies.com/kizuna"')],
  ["accessible estimator status", page.includes('aria-live="polite"')],
  ["pricing version disclosure", page.includes("v2026-07-29")],
  ["homepage product entry", home.includes('href="kizuna.html"')],
  ["sitemap entry", worker.includes('"/kizuna"')],
  ["staging API gate", worker.includes("Provider APIs are disabled in public staging")],
];

await Promise.all([
  access(resolve(root, "assets/css/kizuna.css")),
  access(resolve(root, "assets/js/kizuna.js")),
]);

const failures = required.filter(([, passed]) => !passed);
if (failures.length) {
  for (const [name] of failures) console.error(`FAIL: ${name}`);
  process.exitCode = 1;
} else {
  console.log(`Site checks passed (${required.length} assertions).`);
}
