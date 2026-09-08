import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertReleaseIdentity, readReleaseIdentity } from '../scripts/release/release-metadata.mjs';

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
