import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  BETA_VERSION,
  RELEASE_VERSION,
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
test('release metadata preserves historical Beta and Alpha 2 identity support', async () => {
  assert.equal(BETA_VERSION, '0.2.0-beta.1');
  const source = await readReleaseIdentity(root);
  const beta = betaIdentity(source);
  assert.equal(assertReleaseIdentity(beta, { version: BETA_VERSION }), beta);
  const alpha = betaIdentity(source);
  alpha.version = RELEASE_VERSION;
  alpha.tag = `v${RELEASE_VERSION}`;
  for (const pkg of alpha.packages) {
    pkg.version = RELEASE_VERSION;
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      if (PUBLIC_PACKAGES.some(([publicName]) => publicName === name)) pkg.dependencies[name] = RELEASE_VERSION;
    }
  }
  assert.equal(assertReleaseIdentity(alpha, { version: RELEASE_VERSION }), alpha);
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

test('historical beta candidate governs all eight public packages at one exact version', async () => {
  const identity = betaIdentity(await readReleaseIdentity(root));
  assert.equal(identity.version, BETA_VERSION);
  assert.equal(identity.tag, `v${BETA_VERSION}`);
  assert.equal(assertReleaseIdentity(identity, { version: BETA_VERSION }), identity);
  assert.equal(identity.packages.length, 8);
  assert.equal(identity.packages.every(pkg => pkg.version === BETA_VERSION), true);
  const publicNames = new Set(PUBLIC_PACKAGES.map(([name]) => name));
  for (const pkg of identity.packages) {
    for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
      if (publicNames.has(name)) assert.equal(version, BETA_VERSION, `${pkg.name} -> ${name}`);
    }
  }
});

test('public beta workflow separates validation, release and npm authority', async () => {
  const { readFile } = await import('node:fs/promises');
  const workflow = await readFile(new URL('../.github/workflows/public-beta.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /version:/);
  assert.match(workflow, /release:/);
  assert.match(workflow, /publish_npm:/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /0\.2\.0-beta\.1/);
  assert.match(workflow, /verify:phase13/);
  assert.match(workflow, /verify-reproducible-packages\.mjs/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/);
  const actionRefs = [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map(match => match[1]);
  assert.ok(actionRefs.length >= 6);
  for (const ref of actionRefs) assert.match(ref, /@[0-9a-f]{40}$/);
  const publishJob = workflow.split('publish-npm:')[1] ?? '';
  assert.match(publishJob, /actions\/setup-node@[0-9a-f]{40}/);
  assert.match(publishJob, /node-version:\s*['"]?24/);
});
