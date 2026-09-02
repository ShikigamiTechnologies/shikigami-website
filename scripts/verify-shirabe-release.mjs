import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const observedCwd = process.env.INIT_CWD || process.cwd();
const defaultRoot = /^[\\/][A-Za-z]:[\\/]/.test(observedCwd) ? observedCwd.slice(1) : observedCwd;

function pathAt(root, relativePath) {
  if (/^[A-Za-z]:[\\/]/.test(root)) {
    return `${root.replace(/[\\/]$/, "").replaceAll("\\", "/")}/${relativePath.replaceAll("\\", "/")}`;
  }
  return resolve(root, relativePath);
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function gitRaw(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function verifyShirabeRelease({ checkDirty = true, root: rootOverride } = {}) {
  const root = rootOverride || defaultRoot;
  const manifestPath = pathAt(root, "docs/shirabe-release-truth.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const failures = [];
  const head = git(root, "rev-parse", "HEAD");
  const branch = git(root, "branch", "--show-current");
  const expectedGitSha = process.env.SHIRABE_EXPECTED_GIT_SHA || manifest.expected_git_sha;
  const expectedBranch = process.env.SHIRABE_EXPECTED_BRANCH || manifest.expected_branch;
  const cloudflareVersionId = process.env.SHIRABE_CLOUDFLARE_VERSION_ID || manifest.cloudflare_version_id;
  if (expectedGitSha && head !== expectedGitSha) failures.push(`git_sha:${head}`);
  if (branch !== expectedBranch) failures.push(`branch:${branch}`);

  const ignoreRules = (await readFile(pathAt(root, ".assetsignore"), "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const artifactResults = [];
  for (const artifact of manifest.artifacts) {
    const sourcePath = pathAt(manifest.evidence_source_root, artifact.source);
    const deploymentPath = pathAt(root, artifact.deployment_path);
    const [sourceBytes, deploymentBytes] = await Promise.all([
      readFile(sourcePath),
      readFile(deploymentPath),
    ]);
    const sourceHash = sha256(sourceBytes);
    const deploymentHash = sha256(deploymentBytes);
    if (sourceHash !== artifact.sha256) failures.push(`source_hash:${artifact.source}`);
    if (deploymentHash !== artifact.sha256) failures.push(`deployment_hash:${artifact.deployment_path}`);
    if (sourceHash !== deploymentHash) failures.push(`source_deployment_mismatch:${artifact.source}`);
    if (ignoreRules.some((rule) => rule === "assets/" || rule === "assets/**" || rule === "assets/docs/" || rule === "assets/docs/shirabe/" || rule === artifact.deployment_path)) {
      failures.push(`asset_ignored:${artifact.deployment_path}`);
    }
    artifactResults.push({
      source: artifact.source,
      deployment_path: artifact.deployment_path,
      public_path: artifact.public_path,
      sha256: deploymentHash,
    });
  }

  for (const page of manifest.referencing_pages) {
    const html = await readFile(pathAt(root, page), "utf8");
    for (const artifact of manifest.artifacts) {
      if (!html.includes(artifact.public_path)) failures.push(`missing_reference:${page}:${artifact.public_path}`);
    }
  }

  let liveAssetVerified = false;
  if (process.env.SHIRABE_VERIFY_LIVE === "1") {
    const checks = await Promise.all(artifactResults.map(async (artifact) => {
      const response = await fetch(`${manifest.public_origin}${artifact.public_path}`, { cache: "no-store" });
      if (!response.ok) { failures.push(`live_http:${artifact.public_path}:${response.status}`); return false; }
      const liveHash = sha256(Buffer.from(await response.arrayBuffer()));
      if (liveHash !== artifact.sha256) { failures.push(`live_hash:${artifact.public_path}`); return false; }
      return true;
    }));
    liveAssetVerified = checks.every(Boolean);
    if (!cloudflareVersionId) failures.push("cloudflare_version_id:missing");
  }

  const dirtyPaths = gitRaw(root, "status", "--porcelain=v1")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"));
  const declaredCandidatePaths = new Set([
    ...manifest.preexisting_allowed_dirty_paths,
    ...manifest.candidate_machinery_paths,
  ]);
  const unexpectedDirtyPaths = dirtyPaths.filter((path) => !declaredCandidatePaths.has(path));
  if (checkDirty && unexpectedDirtyPaths.length) failures.push(`unexpected_dirty:${unexpectedDirtyPaths.join(",")}`);

  const releaseReady = failures.length === 0 && Boolean(expectedGitSha) && Boolean(cloudflareVersionId) && liveAssetVerified;
  return {
    schema: manifest.schema,
    status: failures.length ? "failed" : releaseReady ? "verified_live_release" : "verified_local_candidate",
    exact_sha: head,
    expected_git_sha: expectedGitSha,
    sha_bound: Boolean(expectedGitSha),
    branch,
    cloudflare_version_id: cloudflareVersionId,
    artifacts: artifactResults,
    dirty_paths: dirtyPaths,
    unexpected_dirty_paths: unexpectedDirtyPaths,
    live_asset_verified: liveAssetVerified,
    release_ready: releaseReady,
    failures,
    limitations: manifest.limitations,
  };
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/verify-shirabe-release.mjs")) {
  const result = await verifyShirabeRelease();
  console.log(JSON.stringify(result, null, 2));
  if (result.failures.length) process.exitCode = 1;
}
