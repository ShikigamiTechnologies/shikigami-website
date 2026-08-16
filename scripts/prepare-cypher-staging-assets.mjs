import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const output = join(root, ".staging-assets");
const rootFiles = [
  "_headers",
  "acceptable-use.html",
  "cypher-admin-sign-in.html",
  "cypher-admin.html",
  "cypher-app.html",
  "cypher-pilot.html",
  "cypher-sign-in.html",
  "cypher.html",
  "privacy.html",
  "security.html",
  "terms.html",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, "assets"), join(output, "assets"), { recursive: true });

for (const file of rootFiles) {
  await cp(join(root, file), join(output, file));
}

const emitted = await readdir(output);
if (emitted.some((name) => name === ".git" || name === "test-results" || name === "reports")) {
  throw new Error("staging_asset_boundary_violation");
}

console.log(JSON.stringify({ output, rootFiles, emitted }, null, 2));
