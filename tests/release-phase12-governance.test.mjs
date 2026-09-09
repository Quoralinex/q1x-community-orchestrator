import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  PUBLIC_PACKAGES,
  RELEASE_TAG,
  RELEASE_VERSION,
  assertReleaseIdentity,
  buildReleaseManifest,
  readReleaseIdentity,
} from '../scripts/release/release-metadata.mjs';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const expectedPackages = [
  '@quoralinex/q1x-community-contracts',
  '@quoralinex/q1x-community-sdk',
  '@quoralinex/q1x-community-adapter-sdk',
  '@quoralinex/q1x-community-desktop-bridge-common',
  '@quoralinex/q1x-community-desktop-bridge-macos',
  '@quoralinex/q1x-community-desktop-bridge-windows',
  '@quoralinex/q1x-community-desktop-bridge-linux',
  '@quoralinex/q1x-community-runtime',
];
test('Phase 12 release governs the complete eight-package alpha.2 set in dependency order', async () => {
  assert.equal(RELEASE_VERSION, '0.1.0-alpha.2');
  assert.equal(RELEASE_TAG, 'v0.1.0-alpha.2');
  assert.deepEqual(PUBLIC_PACKAGES.map(([name]) => name), expectedPackages);
  const identity = assertReleaseIdentity(await readReleaseIdentity(root));
  assert.deepEqual(identity.packages.map(item => item.name), expectedPackages);
  assert.equal(identity.packages.every(item => item.version === RELEASE_VERSION), true);
});

test('Phase 12 release identity rejects missing first-party packages', async () => {
  const identity = await readReleaseIdentity(root);
  const copy = structuredClone(identity);
  copy.packages.splice(5, 1);
  assert.throws(() => assertReleaseIdentity(copy), /eight public Q1X packages/i);
});

test('all governed internal dependencies are exact to the release version', async () => {
  const identity = assertReleaseIdentity(await readReleaseIdentity(root));
  const names = new Set(expectedPackages);
  for (const pkg of identity.packages) {
    for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
      if (names.has(name)) assert.equal(version, RELEASE_VERSION, `${pkg.name} -> ${name}`);
    }
  }
});
test('release identity rejects private Quoralinex package dependencies', async () => {
  const identity = await readReleaseIdentity(root);
  const copy = structuredClone(identity);
  copy.packages.at(-1).dependencies['@quoralinex/q1x-control-plane'] = RELEASE_VERSION;
  assert.throws(() => assertReleaseIdentity(copy), /private.*dependency/i);
});

test('release manifest is standalone and contains no private endpoint or credential contract', async () => {
  const identity = assertReleaseIdentity(await readReleaseIdentity(root));
  const manifest = buildReleaseManifest({
    identity,
    sourceSha: 'b'.repeat(40),
    artifacts: identity.packages.map((pkg, index) => ({
      filename: `package-${index}.tgz`,
      packageName: pkg.name,
      version: RELEASE_VERSION,
      sha256: String(index).padStart(64, '0'),
    })),
    generatedAt: '2026-09-09T21:00:00.000Z',
  });
  const text = JSON.stringify(manifest);
  assert.doesNotMatch(text, /control[-_. ]?plane|continuity|capsule|Q1X_(?:AUTHORITY|CONTROL_PLANE)/i);
  assert.equal(manifest.packages.length, 8);
});
test('public alpha workflow publishes all eight alpha.2 tarballs in dependency order with trusted publishing only', async () => {
  const workflow = await readFile(join(root, '.github/workflows/public-alpha.yml'), 'utf8');
  let previous = -1;
  for (const name of [
    'contracts', 'sdk', 'adapter-sdk', 'desktop-bridge-common',
    'desktop-bridge-macos', 'desktop-bridge-windows', 'desktop-bridge-linux', 'runtime',
  ]) {
    const filename = `quoralinex-q1x-community-${name}-0.1.0-alpha.2.tgz`;
    const index = workflow.indexOf(filename);
    assert.ok(index > previous, `${filename} missing or out of dependency order`);
    previous = index;
  }
  assert.match(workflow, /--provenance/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/);
});

test('packed consumer verifier checks connector, doctor and every first-party bridge doctor surface', async () => {
  const verifier = await readFile(join(root, 'scripts/release/verify-packed-consumer.mjs'), 'utf8');
  assert.match(verifier, /connectors[^\n]*list/);
  assert.match(verifier, /doctor[^\n]*--json|--json[^\n]*doctor/);
  assert.match(verifier, /\['macos', 'windows', 'linux'\]/);
  assert.match(verifier, /q1x-community-desktop-bridge-\$\{platform\}/);
  assert.match(verifier, /--doctor/);
});
