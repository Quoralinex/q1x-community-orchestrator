import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  BETA_VERSION,
  PUBLIC_PACKAGES,
  assertReleaseIdentity,
  buildReleaseManifest,
  readReleaseIdentity,
} from '../scripts/release/release-metadata.mjs';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

function betaIdentity(alphaIdentity) {
  const copy = structuredClone(alphaIdentity);
  copy.version = BETA_VERSION;
  copy.tag = `v${BETA_VERSION}`;
  for (const pkg of copy.packages) {
    pkg.version = BETA_VERSION;
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      if (PUBLIC_PACKAGES.some(([publicName]) => publicName === name)) pkg.dependencies[name] = BETA_VERSION;
    }
  }
  return copy;
}
test('release metadata accepts the governed beta identity without mutating Alpha 2 source manifests', async () => {
  assert.equal(BETA_VERSION, '0.2.0-beta.1');
  const source = await readReleaseIdentity(root);
  assert.equal(source.version, '0.1.0-alpha.2');
  const beta = betaIdentity(source);
  assert.equal(assertReleaseIdentity(beta, { version: BETA_VERSION }), beta);
});

test('beta manifest carries reproducibility and evidence baselines', async () => {
  const beta = betaIdentity(await readReleaseIdentity(root));
  const artifacts = beta.packages.map((pkg, index) => ({
    filename: `package-${index}.tgz`, packageName: pkg.name,
    version: BETA_VERSION, sha256: String(index).padStart(64, '0'),
    inventory: [{ path: 'package.json', size: 100, sha256: 'a'.repeat(64) }],
  }));
  const manifest = buildReleaseManifest({
    identity: beta, sourceSha: 'd'.repeat(40), artifacts,
    generatedAt: '2026-09-11T00:00:00.000Z', version: BETA_VERSION,
    nodeVersion: '24.18.1', npmVersion: '11.6.0', lockfileSha256: 'e'.repeat(64),
    compatibilityEvidenceBaseline: 'f'.repeat(40), resilienceEvidenceBaseline: '1'.repeat(40),
  });
  assert.equal(manifest.version, BETA_VERSION);
  assert.equal(manifest.tag, `v${BETA_VERSION}`);
  assert.equal(manifest.status, 'beta-candidate');
  assert.equal(manifest.nodeVersion, '24.18.1');
  assert.equal(manifest.npmVersion, '11.6.0');
  assert.equal(manifest.lockfileSha256, 'e'.repeat(64));
  assert.equal(manifest.compatibilityEvidenceBaseline, 'f'.repeat(40));
  assert.equal(manifest.resilienceEvidenceBaseline, '1'.repeat(40));
  assert.equal(manifest.packages.length, 8);
  assert.ok(manifest.artifacts.every(item => Array.isArray(item.inventory)));
});
