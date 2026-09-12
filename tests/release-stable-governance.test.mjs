import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  BETA_VERSION, RC_VERSION, STABLE_VERSION, PUBLIC_PACKAGES,
  assertReleaseIdentity, readReleaseIdentity,
} from '../scripts/release/release-metadata.mjs';
import { verifyPhase13Root } from '../scripts/phase13/verify-completion.mjs';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

test('current source identity is exactly the governed stable RC across all eight packages', async () => {
  assert.equal(RC_VERSION, '1.0.0-rc.1');
  assert.equal(STABLE_VERSION, '1.0.0');
  const identity = await readReleaseIdentity(root);
  assert.equal(identity.version, RC_VERSION);
  assert.equal(identity.tag, `v${RC_VERSION}`);
  assert.equal(assertReleaseIdentity(identity, { version: RC_VERSION }), identity);
  assert.equal(identity.packages.length, 8);
  const names = new Set(PUBLIC_PACKAGES.map(([name]) => name));
  for (const pkg of identity.packages) {
    assert.equal(pkg.version, RC_VERSION, pkg.name);
    for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
      if (names.has(name)) assert.equal(version, RC_VERSION, `${pkg.name} -> ${name}`);
    }
  }
});

test('compatibility identity moves with the stable RC while retaining historical Beta evidence labels', async () => {
  const matrix = JSON.parse(await readFile(new URL('../compatibility/matrix.json', import.meta.url), 'utf8'));
  assert.equal(matrix.projectVersion, RC_VERSION);
  assert.match(matrix.generatedFrom, /^[0-9a-f]{40}$/);
  const betaConsumer = matrix.entries.find(item => item.id === 'package-consumer.beta-tarballs');
  assert.ok(betaConsumer);
  assert.equal(betaConsumer.version, BETA_VERSION);
  assert.match(betaConsumer.target, /beta/i);
});

test('Phase 13 remains historical Beta evidence while current package alignment is RC', async () => {
  const report = await verifyPhase13Root(root);
  assert.equal(report.betaVersion, BETA_VERSION);
  assert.equal(report.currentPackageVersion, RC_VERSION);
  assert.equal(report.required.currentPackageAlignment, true);
  assert.equal(report.ok, true, JSON.stringify(report.findings, null, 2));
});

test('stable release remains staging-only at source alignment time', async () => {
  const identity = await readReleaseIdentity(root);
  assert.equal(identity.version, RC_VERSION);
  assert.notEqual(identity.version, STABLE_VERSION);
});
