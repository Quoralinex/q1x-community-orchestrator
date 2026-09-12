import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  normalizeCompatibilityMatrix,
  renderCompatibilityMarkdown,
  validateCompatibilityMatrix,
} from '../scripts/compatibility/matrix-lib.mjs';

const SHA = '371b27e265a5922184d0a48f57b966b9fbae959b';

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, '\n');
}

function matrix(entries = []) {
  return {
    matrixVersion: '1.0.0',
    projectVersion: '0.1.0-alpha.1',
    generatedFrom: SHA,
    entries,
  };
}

function testedEntry(overrides = {}) {
  return {
    id: 'os.ubuntu-24.04.source',
    category: 'os',
    target: 'Ubuntu 24.04 source install',
    status: 'tested',
    implementation: 'Node.js 24',
    evidence: [{ kind: 'ci', source: '.github/workflows/cross-platform-packaging.yml', commitSha: SHA, environmentTier: 'hosted-runner' }],
    ...overrides,
  };
}

test('accepts a tested entry with concrete CI evidence', () => {
  assert.equal(validateCompatibilityMatrix(matrix([testedEntry()])), true);
});

test('rejects duplicate entry ids', () => {
  const value = matrix([testedEntry(), testedEntry({ target: 'Other target' })]);
  assert.throws(() => validateCompatibilityMatrix(value), /duplicate entry id/i);
});

test('rejects duplicate compatibility tuples', () => {
  const value = matrix([testedEntry(), testedEntry({ id: 'other-id' })]);
  assert.throws(() => validateCompatibilityMatrix(value), /duplicate compatibility tuple/i);
});

test('rejects unsupported category and status values', () => {
  assert.throws(() => validateCompatibilityMatrix(matrix([testedEntry({ category: 'cloud' })])), /category/i);
  assert.throws(() => validateCompatibilityMatrix(matrix([testedEntry({ status: 'works' })])), /status/i);
});

test('requires evidence for tested entries', () => {
  assert.throws(() => validateCompatibilityMatrix(matrix([testedEntry({ evidence: undefined })])), /tested.*evidence/i);
});

test('requires exact lowercase 40-character evidence commit shas', () => {
  assert.throws(
    () => validateCompatibilityMatrix(matrix([testedEntry({ evidence: [{ kind: 'ci', source: 'tests/example.test.mjs', commitSha: 'ABC123', environmentTier: 'fixture' }] })])),
    /commit.*sha/i,
  );
});

test('requires repository-verifiable source paths for CI evidence', () => {
  assert.throws(
    () => validateCompatibilityMatrix(matrix([testedEntry({ evidence: [{ kind: 'ci', source: 'CI says green', commitSha: SHA, environmentTier: 'fixture' }] })])),
    /ci evidence source/i,
  );
});

test('requires caveats for experimental entries', () => {
  const entry = { id: 'browser.other', category: 'browser', target: 'Other browser engines', status: 'experimental' };
  assert.throws(() => validateCompatibilityMatrix(matrix([entry])), /experimental.*caveat/i);
});

test('rejects successful verification evidence on unsupported entries', () => {
  const entry = testedEntry({ id: 'unsupported-one', status: 'unsupported' });
  assert.throws(() => validateCompatibilityMatrix(matrix([entry])), /unsupported.*evidence/i);
});

test('normalizes entries deterministically', () => {
  const first = testedEntry({ id: 'z', category: 'protocol', target: 'Z protocol' });
  const second = testedEntry({ id: 'a', category: 'os', target: 'A OS' });
  const normalized = normalizeCompatibilityMatrix(matrix([first, second]));
  assert.deepEqual(normalized.entries.map(entry => entry.id), ['a', 'z']);
});

test('renders a deterministic matrix with legend, evidence and no-claim warning', () => {
  const value = normalizeCompatibilityMatrix(matrix([testedEntry()]));
  const one = renderCompatibilityMarkdown(value);
  const two = renderCompatibilityMarkdown(value);
  assert.equal(one, two);
  assert.match(one, /tested/i);
  assert.match(one, /experimental/i);
  assert.match(one, /unsupported/i);
  assert.match(one, /cross-platform-packaging\.yml/);
  assert.match(one, new RegExp(SHA));
  assert.match(one, /absence.*not.*compatibility claim/i);
});

test('checked-in matrix source validates and generated markdown is current', async () => {
  const source = JSON.parse(await readFile(new URL('../compatibility/matrix.json', import.meta.url), 'utf8'));
  const markdown = await readFile(new URL('../docs/compatibility-matrix.md', import.meta.url), 'utf8');
  const generated = renderCompatibilityMarkdown(normalizeCompatibilityMatrix(source));
  assert.equal(normalizeLineEndings(markdown), normalizeLineEndings(generated));
});

test('Phase 12 matrix records tested baseline product surfaces with concrete evidence', async () => {
  const source = JSON.parse(await readFile(new URL('../compatibility/matrix.json', import.meta.url), 'utf8'));
  const byId = new Map(source.entries.map(entry => [entry.id, entry]));
  const required = [
    'desktop.macos.first-party',
    'desktop.windows.first-party',
    'desktop.linux.first-party',
    'model.openai-chat.local.fixture',
    'model.openai-responses.local.fixture',
    'model.anthropic-messages.local.fixture',
    'adapter.mcp.stdio.fixture',
    'adapter.mcp.streamable-http.fixture',
    'adapter.a2a.jsonrpc.fixture',
    'adapter.cli.json.fixture',
    'adapter.cli.text.fixture',
    'browser.chromium.managed.runner',
    'protocol.connector-management',
  ];
  for (const id of required) {
    const entry = byId.get(id);
    assert.ok(entry, `missing Phase 12 compatibility entry: ${id}`);
    assert.equal(entry.status, 'tested', `${id} must be tested`);
    assert.ok(Array.isArray(entry.evidence) && entry.evidence.length > 0, `${id} requires evidence`);
    for (const item of entry.evidence) assert.match(item.commitSha, /^[0-9a-f]{40}$/);
  }
  assert.equal(byId.get('desktop.macos.first-party').notes?.includes('physical-host'), true);
  assert.equal(byId.get('desktop.windows.first-party').notes?.includes('physical-host'), true);
});

test('Phase 14 matrix presents RC project identity while retaining historical Beta package-consumer evidence', async () => {
  const source = JSON.parse(await readFile(new URL('../compatibility/matrix.json', import.meta.url), 'utf8'));
  const byId = new Map(source.entries.map(entry => [entry.id, entry]));
  assert.equal(source.projectVersion, '1.0.0-rc.1');
  assert.match(source.generatedFrom, /^[0-9a-f]{40}$/);
  assert.equal(byId.has('package-consumer.alpha-tarballs'), false);
  const consumer = byId.get('package-consumer.beta-tarballs');
  assert.ok(consumer);
  assert.match(consumer.target, /eight-package.*beta/i);
  assert.equal(consumer.version, '0.2.0-beta.1');
  assert.ok(consumer.evidence.some(item => item.source === '.github/workflows/public-beta.yml'));
  for (const id of ['desktop.macos.first-party', 'desktop.windows.first-party', 'desktop.linux.first-party']) {
    assert.match(byId.get(id).implementation, /0\.2\.0-beta\.1$/);
    assert.match(byId.get(id).notes ?? '', /historical[^\n]{0,100}beta|beta[^\n]{0,100}historical/i);
  }
  assert.match(byId.get('protocol.community-adapter').version, /0\.2\.0-beta\.1/);
  assert.match(byId.get('protocol.community-adapter').notes ?? '', /historical[^\n]{0,100}beta|beta[^\n]{0,100}historical/i);
});

test('RC-labelled tested compatibility rows require evidence from an RC source commit', async () => {
  const { execFileSync } = await import('node:child_process');
  const source = JSON.parse(await readFile(new URL('../compatibility/matrix.json', import.meta.url), 'utf8'));
  const root = new URL('..', import.meta.url);
  for (const entry of source.entries.filter(item => item.status === 'tested' && /1\.0\.0-rc\.1/.test(JSON.stringify(item)))) {
    for (const evidence of entry.evidence ?? []) {
      const raw = execFileSync('git', ['show', `${evidence.commitSha}:packages/runtime/package.json`], { cwd: root, encoding: 'utf8' });
      assert.equal(JSON.parse(raw).version, '1.0.0-rc.1', `${entry.id}: ${evidence.commitSha}`);
    }
  }
});

test('generator check mode succeeds only when checked-in markdown matches', () => {
  const result = spawnSync(process.execPath, ['scripts/compatibility/generate-matrix.mjs', '--check'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('every tested compatibility evidence record declares an honest environment tier', async () => {
  const source = JSON.parse(await readFile(new URL('../compatibility/matrix.json', import.meta.url), 'utf8'));
  for (const entry of source.entries.filter(item => item.status === 'tested')) {
    for (const evidence of entry.evidence) {
      assert.match(evidence.environmentTier ?? '', /^(fixture|hosted-runner|physical-host)$/, `${entry.id}: ${evidence.source}`);
    }
  }
});

test('rendered compatibility evidence displays the environment tier', () => {
  const value = matrix([testedEntry({ evidence: [{ kind: 'ci', source: 'tests/example.test.mjs', commitSha: SHA, environmentTier: 'fixture' }] })]);
  assert.match(renderCompatibilityMarkdown(value), /fixture/);
});
