import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyShirabeRelease } from './verify-shirabe-release.mjs';

test('a caller-supplied version identifier never independently attests runtime source', async () => {
  const before = process.env.SHIRABE_CLOUDFLARE_VERSION_ID;
  process.env.SHIRABE_CLOUDFLARE_VERSION_ID = 'synthetic-unverified-version';
  try {
    const result = await verifyShirabeRelease({ checkDirty: false });
    assert.equal(result.runtime_source_binding_verified, false);
    assert.equal(result.release_ready, false);
    assert.notEqual(result.status, 'verified_live_release');
  } finally {
    if (before === undefined) delete process.env.SHIRABE_CLOUDFLARE_VERSION_ID;
    else process.env.SHIRABE_CLOUDFLARE_VERSION_ID = before;
  }
});
