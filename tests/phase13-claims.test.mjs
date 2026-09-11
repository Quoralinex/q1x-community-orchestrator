import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('public docs describe a beta-ready candidate without claiming a commissioned beta release', async () => {
  const combined = [
    await text('README.md'),
    await text('docs/index.md'),
    await text('docs/roadmap.md'),
    await text('docs/known-limitations.md'),
    await text('docs/prerelease.md'),
  ].join('\n');
  assert.match(combined, /0\.2\.0-beta\.1/);
  assert.match(combined, /beta[- ]ready candidate/i);
  assert.match(combined, /v0\.1\.0-alpha\.2[\s\S]{0,180}commissioned/i);
  assert.match(combined, /experimental|not production[- ]ready/i);
  assert.doesNotMatch(combined, /current commissioned beta|beta has been released/i);
});

test('historical Alpha 2 documentation remains present and immutable in scope', async () => {
  const alpha = await text('docs/public-alpha.md');
  assert.match(alpha, /v0\.1\.0-alpha\.2/);
  assert.match(alpha, /SHA256SUMS/);
  assert.doesNotMatch(alpha, /0\.2\.0-beta\.1/);
});
