import { describe, expect, it } from "vitest";
import manifestRaw from "../docs/shirabe-release-truth.json?raw";
import checker from "../scripts/verify-shirabe-release.mjs?raw";
import evidencePage from "../evidence/shirabe-synthetic-benchmark/index.html?raw";
import evidencePageEs from "../es/evidencia/benchmark-sintetico-shirabe/index.html?raw";

describe("SHIRABE release truth", () => {
  it("declares a fail-closed exact-SHA asset contract for both public evidence pages", () => {
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.expected_git_sha).toBeNull();
    expect(manifest.cloudflare_version_id).toBeNull();
    expect(manifest.status).toBe("local_candidate_not_deployed");
    expect(manifest.artifacts).toHaveLength(1);
    const artifact = manifest.artifacts[0];
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidencePage).toContain(artifact.public_path);
    expect(evidencePageEs).toContain(artifact.public_path);
    expect(checker).toContain("source_deployment_mismatch");
    expect(checker).toContain("SHIRABE_EXPECTED_GIT_SHA");
    expect(checker).toContain("sha_bound: Boolean(expectedGitSha)");
    expect(checker).toContain("SHIRABE_VERIFY_LIVE");
    expect(checker).toContain("SHIRABE_CLOUDFLARE_VERSION_ID");
    expect(checker).toContain("live_asset_verified: liveAssetVerified");
    expect(checker).toContain("release_ready: releaseReady");
  });
});
