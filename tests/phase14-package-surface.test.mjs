import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BETA_VERSION,
  PUBLIC_PACKAGES,
  RC_VERSION,
  RELEASE_VERSION,
  STABLE_VERSION,
  SUPPORTED_RELEASE_VERSIONS,
  assertReleaseIdentity,
  buildReleaseManifest,
  readReleaseIdentity,
} from '../scripts/release/release-metadata.mjs';
import { validatePackedManifest } from '../scripts/release/verify-packed-consumer.mjs';
import { parseReproducibilityArgs } from '../scripts/release/verify-reproducible-packages.mjs';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHA = 'a'.repeat(40);

function identityAtVersion(source, version) {
  const identity = structuredClone(source);
  identity.version = version;
  identity.tag = `v${version}`;
  const publicNames = new Set(PUBLIC_PACKAGES.map(([name]) => name));
  for (const pkg of identity.packages) {
    pkg.version = version;
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      if (publicNames.has(name)) pkg.dependencies[name] = version;
    }
  }
  return identity;
}
function artifactsFor(identity, version) {
  return identity.packages.map((pkg, index) => ({
    filename: `package-${index}.tgz`, packageName: pkg.name, version,
    sha256: String(index).padStart(64, '0'), inventory: [],
  }));
}

test('release metadata governs RC and stable identities without dropping Alpha or Beta', async () => {
  assert.equal(RC_VERSION, '1.0.0-rc.1');
  assert.equal(STABLE_VERSION, '1.0.0');
  assert.deepEqual(SUPPORTED_RELEASE_VERSIONS, [RELEASE_VERSION, BETA_VERSION, RC_VERSION, STABLE_VERSION]);
  const source = await readReleaseIdentity(root);
  for (const version of SUPPORTED_RELEASE_VERSIONS) {
    const identity = identityAtVersion(source, version);
    assert.equal(assertReleaseIdentity(identity, { version }), identity);
  }
});

test('RC and stable manifests carry distinct governed status values', async () => {
  const source = await readReleaseIdentity(root);
  for (const [version, status] of [[RC_VERSION, 'stable-rc-candidate'], [STABLE_VERSION, 'stable']]) {
    const identity = identityAtVersion(source, version);
    const manifest = buildReleaseManifest({
      identity, sourceSha: SHA, artifacts: artifactsFor(identity, version),
      generatedAt: '2026-09-11T00:00:00.000Z', version,
    });
    assert.equal(manifest.version, version);
    assert.equal(manifest.tag, `v${version}`);
    assert.equal(manifest.status, status);
    assert.doesNotThrow(() => validatePackedManifest(manifest));
  }
});

test('packed manifest validation retains historical Alpha and Beta support', async () => {
  const source = await readReleaseIdentity(root);
  for (const [version, status] of [[RELEASE_VERSION, 'public-alpha'], [BETA_VERSION, 'beta-candidate']]) {
    const identity = identityAtVersion(source, version);
    const manifest = buildReleaseManifest({
      identity, sourceSha: SHA, artifacts: artifactsFor(identity, version),
      generatedAt: '2026-09-11T00:00:00.000Z', version,
    });
    assert.equal(manifest.status, status);
    assert.doesNotThrow(() => validatePackedManifest(manifest));
  }
});

test('reproducibility CLI parser requires explicit governed version and source SHA', () => {
  assert.deepEqual(parseReproducibilityArgs(['--version', RC_VERSION, '--source-sha', SHA]), {
    version: RC_VERSION, sourceSha: SHA,
  });
  assert.deepEqual(parseReproducibilityArgs(['--version', STABLE_VERSION, '--source-sha', SHA]), {
    version: STABLE_VERSION, sourceSha: SHA,
  });
  assert.throws(() => parseReproducibilityArgs(['--source-sha', SHA]), /version/i);
  assert.throws(() => parseReproducibilityArgs(['--version', RC_VERSION]), /source[- ]sha/i);
});

test('package surface is version-neutral across RC and stable but fails on real drift', async () => {
  const { buildPackageSurface, comparePackageSurface } = await import('../scripts/phase14/package-surface.mjs');
  const source = await readReleaseIdentity(root);
  const publicNames = new Set(PUBLIC_PACKAGES.map(([name]) => name));
  const packageManifests = source.packages.map(pkg => ({
    name: pkg.name,
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    bin: pkg.name.endsWith('-runtime') ? { q1x: './dist/cli.js' } : null,
    engines: { node: '>=24' },
    license: 'SEE LICENSE IN LICENSE',
    dependencies: Object.fromEntries(Object.keys(pkg.dependencies ?? {}).map(name => [name, publicNames.has(name) ? RC_VERSION : 'external'])),
  }));
  const inventory = source.packages.map(pkg => ({ packageName: pkg.name, files: [
    { path: 'package.json', size: 100, sha256: 'b'.repeat(64) },
    { path: 'dist/index.js', size: 200, sha256: 'c'.repeat(64) },
  ] }));
  const rc = buildPackageSurface({ packageManifests, inventory, governedVersion: RC_VERSION });
  const stable = buildPackageSurface({ packageManifests: packageManifests.map(pkg => ({
    ...pkg,
    dependencies: Object.fromEntries(Object.entries(pkg.dependencies).map(([name, value]) => [name, publicNames.has(name) ? STABLE_VERSION : value])),
  })), inventory, governedVersion: STABLE_VERSION });
  assert.equal(rc.schema, 'q1x.phase14-package-surface.v1');
  assert.equal(rc.packages.length, 8);
  assert.ok(rc.packages.every(pkg => pkg.internalDependencies.every(dep => dep.versionPolicy === 'exact-governed-release')));
  assert.equal(JSON.stringify(rc).includes(RC_VERSION), false);
  assert.deepEqual(stable, rc);
  assert.equal(comparePackageSurface(rc, stable).ok, true);

  const broken = structuredClone(stable);
  broken.packages[0].files.pop();
  assert.equal(comparePackageSurface(rc, broken).ok, false);
});
