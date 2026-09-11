import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { verifyPhase12Root } from '../scripts/phase12/verify-completion.mjs';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const requiredConnectors = [
  'desktop.macos.first-party', 'desktop.windows.first-party', 'desktop.linux.first-party',
  'model.openai-chat.local', 'model.openai-responses.local', 'model.anthropic-messages.local',
  'mcp.stdio', 'mcp.streamable-http', 'a2a.jsonrpc', 'cli.json', 'cli.text',
  'browser.chromium.managed', 'browser.chromium.cdp',
];

const requiredCompatibility = [
  'desktop.macos.first-party', 'desktop.windows.first-party', 'desktop.linux.first-party',
  'model.openai-chat.local.fixture', 'model.openai-responses.local.fixture',
  'model.anthropic-messages.local.fixture', 'adapter.mcp.stdio.fixture',
  'adapter.mcp.streamable-http.fixture', 'adapter.a2a.jsonrpc.fixture',
  'adapter.cli.json.fixture', 'adapter.cli.text.fixture', 'browser.chromium.managed.runner',
  'protocol.connector-management',
];
test('Phase 12 completion verifier accepts the current structural and evidence contract', async () => {
  const report = await verifyPhase12Root(root);
  assert.equal(report.ok, true, JSON.stringify(report.findings, null, 2));
  assert.equal(report.phase, 12);
  assert.equal(report.releaseVersion, '0.1.0-alpha.2');
  assert.equal(report.currentPackageVersion, '0.2.0-beta.1');
  assert.equal(report.compatibilityProjectVersion, report.currentPackageVersion);
  assert.equal(report.standalone.ok, true);
  assert.equal(report.ciEvidenceRequired, true);
  assert.match(report.compatibilityEvidenceBaseline, /^[0-9a-f]{40}$/);
  assert.deepEqual(new Set(report.connectors), new Set(requiredConnectors));
  for (const id of requiredCompatibility) assert.ok(report.compatibilityEntries.includes(id), id);
});

test('completion verifier confirms the complete first-party package and executable surface', async () => {
  const report = await verifyPhase12Root(root);
  assert.deepEqual(report.packages.map(item => item.name), [
    '@quoralinex/q1x-community-contracts',
    '@quoralinex/q1x-community-sdk',
    '@quoralinex/q1x-community-adapter-sdk',
    '@quoralinex/q1x-community-desktop-bridge-common',
    '@quoralinex/q1x-community-desktop-bridge-macos',
    '@quoralinex/q1x-community-desktop-bridge-windows',
    '@quoralinex/q1x-community-desktop-bridge-linux',
    '@quoralinex/q1x-community-runtime',
  ]);
  assert.equal(new Set(report.packages.map(item => item.version)).size, 1);
  assert.equal(report.packages[0].version, report.currentPackageVersion);
  assert.deepEqual(report.executables.sort(), [
    'q1x', 'q1x-desktop-bridge-linux', 'q1x-desktop-bridge-macos', 'q1x-desktop-bridge-windows',
  ].sort());
});
test('completion verifier requires doctor, product workflow, public usability docs and standalone verifier', async () => {
  const report = await verifyPhase12Root(root);
  assert.equal(report.requiredSurfaces.doctor, true);
  assert.equal(report.requiredSurfaces.productUsabilityWorkflow, true);
  assert.equal(report.requiredSurfaces.crossPlatformProductGate, true);
  assert.equal(report.requiredSurfaces.productUsabilityDocument, true);
  assert.equal(report.requiredSurfaces.standaloneVerifier, true);
  assert.equal(report.requiredSurfaces.releaseGovernance, true);
});

test('completion verifier fails closed for an empty repository root', async t => {
  const empty = await mkdtemp(join(tmpdir(), 'q1x-phase12-empty-'));
  t.after(() => rm(empty, { recursive: true, force: true }));
  const report = await verifyPhase12Root(empty);
  assert.equal(report.ok, false);
  assert.ok(report.findings.length > 5);
  assert.equal(report.ciEvidenceRequired, true);
});
