import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  RELEASE_TAG,
  RELEASE_VERSION,
  PUBLIC_PACKAGES,
  assertReleaseIdentity,
  buildReleaseManifest,
  formatChecksums,
  readReleaseIdentity,
  sha256File
} from '../scripts/release/release-metadata.mjs';
import { verifyPackedConsumer } from '../scripts/release/verify-packed-consumer.mjs';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

async function historicalAlphaIdentity() {
  const identity = structuredClone(await readReleaseIdentity(root));
  identity.version = RELEASE_VERSION;
  identity.tag = RELEASE_TAG;
  const publicNames = new Set(PUBLIC_PACKAGES.map(([name]) => name));
  for (const pkg of identity.packages) {
    pkg.version = RELEASE_VERSION;
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      if (publicNames.has(name)) pkg.dependencies[name] = RELEASE_VERSION;
    }
  }
  return identity;
}

test('historical public alpha identity remains exact and version locked', async () => {
  const identity = await historicalAlphaIdentity();
  assert.equal(identity.version, RELEASE_VERSION);
  assert.equal(identity.tag, RELEASE_TAG);
  assert.equal(identity.rootPrivate, true);
  assert.deepEqual(identity.packages.map(item => item.name), [
    '@quoralinex/q1x-community-contracts',
    '@quoralinex/q1x-community-sdk',
    '@quoralinex/q1x-community-adapter-sdk',
    '@quoralinex/q1x-community-desktop-bridge-common',
    '@quoralinex/q1x-community-desktop-bridge-macos',
    '@quoralinex/q1x-community-desktop-bridge-windows',
    '@quoralinex/q1x-community-desktop-bridge-linux',
    '@quoralinex/q1x-community-runtime'
  ]);
  assert.equal(assertReleaseIdentity(identity), identity);
});

test('release identity rejects a mismatched internal dependency', async () => {
  const identity = await historicalAlphaIdentity();
  const copy = structuredClone(identity);
  copy.packages.find(item => item.name === '@quoralinex/q1x-community-runtime').dependencies['@quoralinex/q1x-community-sdk'] = '^0.1.0-alpha.2';
  assert.throws(() => assertReleaseIdentity(copy), /exact internal dependency/i);
});

test('release manifest hashes the complete package set deterministically and rejects a non-commit source reference', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'q1x-release-integrity-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const identity = assertReleaseIdentity(await historicalAlphaIdentity());
  const artifacts = [];
  for (let index = 0; index < identity.packages.length; index += 1) {
    const packageInfo = identity.packages[index];
    const filename = `${String(identity.packages.length - index).padStart(2, '0')}-${packageInfo.name.split('/').at(-1)}.tgz`;
    const path = join(directory, filename);
    await writeFile(path, `artifact:${packageInfo.name}`);
    artifacts.push({
      filename,
      sha256: await sha256File(path),
      packageName: packageInfo.name,
      version: RELEASE_VERSION,
    });
  }
  for (const artifact of artifacts) assert.match(artifact.sha256, /^[0-9a-f]{64}$/);

  const manifest = buildReleaseManifest({
    identity,
    sourceSha: 'a'.repeat(40),
    artifacts,
    generatedAt: '2026-09-08T00:00:00.000Z',
  });
  assert.equal(manifest.status, 'public-alpha');
  assert.equal(manifest.version, RELEASE_VERSION);
  assert.equal(manifest.tag, RELEASE_TAG);
  assert.equal(manifest.sourceSha, 'a'.repeat(40));
  assert.equal(manifest.artifacts.length, 8);
  assert.deepEqual(
    manifest.artifacts.map(item => item.filename),
    [...artifacts].map(item => item.filename).sort(),
  );
  const checksumLines = formatChecksums(artifacts).trim().split('\n');
  assert.equal(checksumLines.length, 8);
  assert.deepEqual(checksumLines.map(line => line.split('  ')[1]), [...artifacts].map(item => item.filename).sort());

  assert.throws(
    () => buildReleaseManifest({ identity, sourceSha: 'main', artifacts, generatedAt: '2026-09-08T00:00:00.000Z' }),
    /source sha/i,
  );
});

test('packed consumer verification fails clearly when the governed release bundle is missing', async () => {
  await assert.rejects(
    () => verifyPackedConsumer(join(tmpdir(), 'q1x-missing-release-artifacts')),
    /release-manifest\.json/i
  );
});
