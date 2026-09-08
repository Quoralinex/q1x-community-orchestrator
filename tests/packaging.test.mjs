import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const text = path => readFile(join(root, path), 'utf8');

test('Docker image is non-root, persistent and health checked', async () => {
  const dockerfile = await text('Dockerfile');
  assert.match(dockerfile, /FROM node:24-bookworm-slim AS build/);
  assert.match(dockerfile, /FROM node:24-bookworm-slim AS runtime/);
  assert.match(dockerfile, /USER 10001:10001/);
  assert.match(dockerfile, /Q1X_HOME=\/data/);
  assert.match(dockerfile, /VOLUME \["\/data"\]/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /packages\/runtime\/dist\/service\.js/);
  assert.doesNotMatch(dockerfile, /USER root/);
});

test('Compose profile confines the health port and removes ambient privilege', async () => {
  const compose = await text('compose.yaml');
  assert.match(compose, /127\.0\.0\.1:8787:8787/);
  assert.match(compose, /q1x-state:\/data/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop:\s*\n\s*- ALL/);
  assert.match(compose, /no-new-privileges:true/);
});

test('runtime env example contains configuration but no credential values', async () => {
  const env = await text('config/runtime.env.example');
  assert.match(env, /Q1X_HOME=/);
  assert.match(env, /Q1X_HOST=/);
  assert.match(env, /Q1X_PORT=/);
  assert.doesNotMatch(env, /(API_KEY|TOKEN|PASSWORD|SECRET)\s*=/i);
});

test('cross-platform workflow covers Linux, Windows, macOS and pinned actions', async () => {
  const workflow = await text('.github/workflows/cross-platform-packaging.yml');
  assert.match(workflow, /ubuntu-24\.04/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /macos-latest/);
  const actionRefs = [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map(match => match[1]);
  assert.ok(actionRefs.length >= 2);
  for (const ref of actionRefs) assert.match(ref, /@[0-9a-f]{40}$/);
  assert.match(workflow, /docker build --pull/);
  assert.match(workflow, /npm pack --dry-run --workspace packages\/runtime/);
});

test('public alpha workflow is manual-release, fail-closed and action-pinned', async () => {
  const workflow = await text('.github/workflows/public-alpha.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /release:/);
  assert.match(workflow, /publish_npm:/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /scripts\/release\/prepare-alpha\.mjs/);
  assert.match(workflow, /scripts\/release\/verify-packed-consumer\.mjs/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /gh api.*git\/refs/);
  assert.match(workflow, /--provenance/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|npm_[A-Za-z0-9]/);
  assert.doesNotMatch(workflow, /push:\s*\n\s*tags:/);
  const actionRefs = [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map(match => match[1]);
  assert.ok(actionRefs.length >= 4);
  for (const ref of actionRefs) assert.match(ref, /@[0-9a-f]{40}$/);
});

test('public alpha documentation covers install, verification, recovery and limitations', async () => {
  const alpha = await text('docs/public-alpha.md');
  assert.match(alpha, /0\.1\.0-alpha\.1/);
  assert.match(alpha, /source installation/i);
  assert.match(alpha, /packed package/i);
  assert.match(alpha, /Docker/i);
  assert.match(alpha, /healthz/);
  assert.match(alpha, /readyz/);
  assert.match(alpha, /rollback/i);
  assert.match(alpha, /security/i);
  assert.match(alpha, /SHA256SUMS/);

  const limits = await text('docs/known-limitations.md');
  assert.match(limits, /actor identifiers.*not cryptographically authenticated/is);
  assert.match(limits, /not an externally anchored transparency log/i);
  assert.match(limits, /browser binaries are not bundled/i);
  assert.match(limits, /desktop.*optional.*bridge/is);
  assert.match(limits, /single-node/i);
  assert.match(limits, /breaking changes/i);
  assert.match(limits, /npm publication.*may be unavailable/is);

  const changelog = await text('CHANGELOG.md');
  assert.match(changelog, /0\.1\.0-alpha\.1/);
  const notes = await text('RELEASE_NOTES.md');
  assert.match(notes, /public alpha/i);
  assert.match(notes, /Phase 11/i);
});
