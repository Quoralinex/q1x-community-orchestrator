import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { assertReleaseIdentity, readReleaseIdentity } from '../scripts/release/release-metadata.mjs';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

test('public alpha governs exactly eight packages in dependency order', async () => {
  const identity = assertReleaseIdentity(await readReleaseIdentity(root));
  assert.deepEqual(identity.packages.map(item => item.name), [
    '@quoralinex/q1x-community-contracts',
    '@quoralinex/q1x-community-sdk',
    '@quoralinex/q1x-community-adapter-sdk',
    '@quoralinex/q1x-community-desktop-bridge-common',
    '@quoralinex/q1x-community-desktop-bridge-macos',
    '@quoralinex/q1x-community-desktop-bridge-windows',
    '@quoralinex/q1x-community-desktop-bridge-linux',
    '@quoralinex/q1x-community-runtime',
  ]);
  const adapter = identity.packages[2];
  assert.equal(adapter.version, '0.1.0-alpha.2');
  assert.equal(adapter.dependencies['@quoralinex/q1x-community-sdk'], '0.1.0-alpha.2');
  assert.equal(identity.packages[7].dependencies['@quoralinex/q1x-community-adapter-sdk'], '0.1.0-alpha.2');
});

test('public alpha workflow publishes the governed package set in dependency order', async () => {
  const workflow = await readFile(join(root, '.github/workflows/public-alpha.yml'), 'utf8');
  const files = [
    'quoralinex-q1x-community-contracts-0.1.0-alpha.2.tgz',
    'quoralinex-q1x-community-sdk-0.1.0-alpha.2.tgz',
    'quoralinex-q1x-community-adapter-sdk-0.1.0-alpha.2.tgz',
    'quoralinex-q1x-community-desktop-bridge-common-0.1.0-alpha.2.tgz',
    'quoralinex-q1x-community-desktop-bridge-macos-0.1.0-alpha.2.tgz',
    'quoralinex-q1x-community-desktop-bridge-windows-0.1.0-alpha.2.tgz',
    'quoralinex-q1x-community-desktop-bridge-linux-0.1.0-alpha.2.tgz',
    'quoralinex-q1x-community-runtime-0.1.0-alpha.2.tgz',
  ];
  let previous = -1;
  for (const file of files) {
    const index = workflow.indexOf(file);
    assert.ok(index > previous, `${file} must appear in dependency order`);
    previous = index;
  }
});
