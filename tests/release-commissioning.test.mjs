import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  assertReleaseIdentity,
  buildReleaseManifest,
  formatChecksums,
  readReleaseIdentity,
  sha256File
} from '../scripts/release/release-metadata.mjs';
import { verifyPackedConsumer } from '../scripts/release/verify-packed-consumer.mjs';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

test('public alpha identity is exact and version locked', async () => {
  const identity = await readReleaseIdentity(root);
  assert.equal(identity.version, '0.1.0-alpha.1');
  assert.equal(identity.tag, 'v0.1.0-alpha.1');
  assert.equal(identity.rootPrivate, true);
  assert.deepEqual(identity.packages.map(item => item.name), [
    '@quoralinex/q1x-community-contracts',
    '@quoralinex/q1x-community-sdk',
    '@quoralinex/q1x-community-runtime'
  ]);
  assert.equal(assertReleaseIdentity(identity), identity);
});

test('release identity rejects a mismatched internal dependency', async () => {
  const identity = await readReleaseIdentity(root);
  const copy = structuredClone(identity);
  copy.packages.find(item => item.name === '@quoralinex/q1x-community-runtime').dependencies['@quoralinex/q1x-community-sdk'] = '^0.1.0-alpha.1';
  assert.throws(() => assertReleaseIdentity(copy), /exact internal dependency/i);
});

test('release manifest hashes artifacts deterministically and rejects a non-commit source reference', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'q1x-release-integrity-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const firstPath = join(directory, 'z-package.tgz');
  const secondPath = join(directory, 'a-package.tgz');
  await writeFile(firstPath, 'first artifact');
  await writeFile(secondPath, 'second artifact');
  const artifacts = [
    { filename: 'z-package.tgz', sha256: await sha256File(firstPath), packageName: '@quoralinex/q1x-community-runtime', version: '0.1.0-alpha.1' },
    { filename: 'a-package.tgz', sha256: await sha256File(secondPath), packageName: '@quoralinex/q1x-community-contracts', version: '0.1.0-alpha.1' }
  ];
  for (const artifact of artifacts) assert.match(artifact.sha256, /^[0-9a-f]{64}$/);

  const identity = assertReleaseIdentity(await readReleaseIdentity(root));
  const manifest = buildReleaseManifest({
    identity,
    sourceSha: 'a'.repeat(40),
    artifacts,
    generatedAt: '2026-09-08T00:00:00.000Z'
  });
  assert.equal(manifest.status, 'public-alpha');
  assert.equal(manifest.version, '0.1.0-alpha.1');
  assert.equal(manifest.tag, 'v0.1.0-alpha.1');
  assert.equal(manifest.sourceSha, 'a'.repeat(40));
  assert.deepEqual(manifest.artifacts.map(item => item.filename), ['a-package.tgz', 'z-package.tgz']);
  assert.equal(formatChecksums(artifacts), `${artifacts[1].sha256}  a-package.tgz\n${artifacts[0].sha256}  z-package.tgz\n`);

  assert.throws(
    () => buildReleaseManifest({ identity, sourceSha: 'main', artifacts, generatedAt: '2026-09-08T00:00:00.000Z' }),
    /source sha/i
  );
});

test('packed consumer verification fails clearly when the governed release bundle is missing', async () => {
  await assert.rejects(
    () => verifyPackedConsumer(join(tmpdir(), 'q1x-missing-release-artifacts')),
    /release-manifest\.json/i
  );
});
