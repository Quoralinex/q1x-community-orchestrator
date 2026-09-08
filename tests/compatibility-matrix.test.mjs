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
    evidence: [{ kind: 'ci', source: '.github/workflows/cross-platform-packaging.yml', commitSha: SHA }],
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
    () => validateCompatibilityMatrix(matrix([testedEntry({ evidence: [{ kind: 'ci', source: 'tests/example.test.mjs', commitSha: 'ABC123' }] })])),
    /commit.*sha/i,
  );
});

test('requires repository-verifiable source paths for CI evidence', () => {
  assert.throws(
    () => validateCompatibilityMatrix(matrix([testedEntry({ evidence: [{ kind: 'ci', source: 'CI says green', commitSha: SHA }] })])),
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
  assert.equal(markdown, generated);
});

test('generator check mode succeeds only when checked-in markdown matches', () => {
  const result = spawnSync(process.execPath, ['scripts/compatibility/generate-matrix.mjs', '--check'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
