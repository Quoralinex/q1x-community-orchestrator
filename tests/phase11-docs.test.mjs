import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const text = path => readFile(join(root, path), 'utf8');

test('Phase 11 adapter SDK documentation states the public compatibility and trust boundary', async () => {
  const guide = await text('docs/community-adapter-sdk.md');
  assert.match(guide, /@quoralinex\/q1x-community-adapter-sdk/);
  assert.match(guide, /0\.1\.0-alpha\.2/);
  assert.match(guide, /contract.*1\.0\.0/i);
  assert.match(guide, /runtime.*0\.1\.x/i);
  assert.match(guide, /runAdapterConformance/);
  assert.match(guide, /communityAdapterTransport/);
  assert.match(guide, /OpenControlRuntime\.open/);
  assert.match(guide, /examples\/community-adapter/);
  assert.match(guide, /not.*sandbox/i);
  assert.match(guide, /conformance.*not.*trust|conformance.*does not.*trust/i);
  assert.match(guide, /operator-controlled|operator controlled/i);
  assert.match(guide, /compatibility-matrix\.md/);
  assert.match(guide, /PolyForm Noncommercial/i);
});

test('public alpha documentation governs eight tarballs including the adapter SDK and desktop bridges without claiming npm publication', async () => {
  const alpha = await text('docs/public-alpha.md');
  assert.match(alpha, /eight package tarballs/i);
  assert.match(alpha, /quoralinex-q1x-community-adapter-sdk-0\.1\.0-alpha\.2\.tgz/);
  assert.match(alpha, /contracts,.*SDK,.*Adapter SDK,.*desktop bridge.*runtime/i);
  assert.doesNotMatch(alpha, /have been published to npm|available on npm now/i);
});

test('repository surfaces link Phase 11 compatibility and adapter authoring without overclaiming trust', async () => {
  const readme = await text('README.md');
  const index = await text('docs/index.md');
  const limitations = await text('docs/known-limitations.md');
  const adapters = await text('docs/agent-cli-adapters.md');
  const changelog = await text('CHANGELOG.md');
  for (const value of [readme, index]) {
    assert.match(value, /compatibility-matrix\.md/);
    assert.match(value, /community-adapter-sdk\.md/);
  }
  assert.match(limitations, /not.*sandbox/i);
  assert.match(limitations, /conformance.*not.*trust|conformance.*does not.*trust/i);
  assert.match(adapters, /@quoralinex\/q1x-community-adapter-sdk/);
  assert.match(adapters, /explicit/i);
  assert.match(changelog, /four public packages/i);
  assert.match(changelog, /Community Adapter SDK/);
});
