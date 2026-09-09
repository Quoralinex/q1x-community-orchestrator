import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const read = path => readFile(join(root, path), 'utf8');
const activeDocs = [
  'README.md',
  'docs/index.md',
  'docs/desktop-control.md',
  'docs/browser-control.md',
  'docs/model-transport.md',
  'docs/agent-cli-adapters.md',
  'docs/known-limitations.md',
  'docs/deployment.md',
  'docs/roadmap.md',
  'docs/public-alpha.md',
  'docs/product-usability.md',
];
test('Phase 12 product usability page maps every baseline surface to ordinary user commands', async () => {
  const doc = await read('docs/product-usability.md');
  for (const term of [
    'q1x connectors list',
    'q1x connectors add',
    'q1x connectors test',
    'q1x doctor --json',
    'model', 'MCP', 'A2A', 'CLI', 'browser', 'desktop',
  ]) assert.match(doc, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.match(doc, /no Q1X code development/i);
  assert.match(doc, /no private Quoralinex service/i);
});

test('active product docs describe standalone operation and never instruct private service configuration', async () => {
  for (const path of activeDocs) {
    const doc = await read(path);
    assert.doesNotMatch(doc, /configure[^\n]*(?:Q1X Control Plane|control-plane\.q1x|Q1X_CONTROL_PLANE)/i, path);
    assert.doesNotMatch(doc, /requires?\s+(?:a\s+)?(?:private Quoralinex|Q1X Control Plane)/i, path);
  }
  const combined = (await Promise.all(activeDocs.map(read))).join('\n');
  assert.match(combined, /standalone/i);
});
test('public claims state first-party desktop bridges are shipped while preserving OS permission caveats', async () => {
  const desktop = await read('docs/desktop-control.md');
  const limitations = await read('docs/known-limitations.md');
  const combined = `${desktop}\n${limitations}`;
  assert.doesNotMatch(combined, /Native desktop drivers are not universally bundled/i);
  assert.match(combined, /first-party.*macOS.*Windows.*Linux/is);
  assert.match(combined, /Accessibility/i);
  assert.match(combined, /UI Automation/i);
  assert.match(combined, /AT-SPI/i);
  assert.match(combined, /permission|graphical session|Wayland/i);
});

test('Phase 12 documentation states legitimate user prerequisites without inventing provider support', async () => {
  const usability = await read('docs/product-usability.md');
  assert.match(usability, /API key|credential/i);
  assert.match(usability, /local model service|model service/i);
  assert.match(usability, /supported.*Chromium|Chromium.*installed/i);
  assert.match(usability, /macOS Accessibility/i);
  assert.match(usability, /AT-SPI/i);
  assert.match(usability, /MCP|A2A/);
  assert.match(usability, /provider-specific.*not.*claim|not.*provider-specific/i);
});
test('release-facing docs preserve immutable alpha.1 history and describe the governed alpha.2 package set', async () => {
  const readme = await read('README.md');
  const alpha = await read('docs/public-alpha.md');
  const combined = `${readme}\n${alpha}`;
  assert.match(combined, /v0\.1\.0-alpha\.1/);
  assert.match(combined, /immutable/i);
  assert.match(combined, /v0\.1\.0-alpha\.2/);
  assert.match(combined, /eight.*package|8.*package/i);
  for (const platform of ['macOS', 'Windows', 'Linux']) assert.match(combined, new RegExp(platform));
});

test('roadmap identifies Phase 12 as baseline usability completion before hardening', async () => {
  const roadmap = await read('docs/roadmap.md');
  assert.match(roadmap, /Phase 12/i);
  assert.match(roadmap, /core usability|baseline usability/i);
  assert.match(roadmap, /hardening/i);
});
