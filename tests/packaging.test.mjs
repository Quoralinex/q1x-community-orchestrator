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
  assert.match(workflow, /--target "\$GITHUB_SHA"/);
  assert.doesNotMatch(workflow, /git\/refs/);
  assert.doesNotMatch(workflow, /--verify-tag/);
  assert.match(workflow, /--provenance/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|npm_[A-Za-z0-9]/);
  assert.doesNotMatch(workflow, /push:\s*\n\s*tags:/);
  const actionRefs = [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map(match => match[1]);
  assert.ok(actionRefs.length >= 4);
  for (const ref of actionRefs) assert.match(ref, /@[0-9a-f]{40}$/);
});

test('compatibility workflow is focused, read-only and action-pinned', async () => {
  const workflow = await text('.github/workflows/compatibility.yml');
  assert.match(workflow, /name:\s*Compatibility Matrix/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /compatibility\/\*\*/);
  assert.match(workflow, /scripts\/compatibility\/\*\*/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /ubuntu-24\.04/);
  assert.match(workflow, /npm ci --no-audit --no-fund/);
  assert.match(workflow, /npm run test:compatibility/);
  const actionRefs = [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map(match => match[1]);
  assert.ok(actionRefs.length >= 2);
  for (const ref of actionRefs) assert.match(ref, /@[0-9a-f]{40}$/);
});

test('public alpha documentation preserves release and security boundaries', async () => {
  const quickStart = await text('docs/public-alpha.md');
  const limitations = await text('docs/known-limitations.md');
  assert.match(quickStart, /0\.1\.0-alpha\.1/);
  assert.match(quickStart, /SHA256SUMS/);
  assert.match(quickStart, /source installation/i);
  assert.match(quickStart, /packed package installation/i);
  assert.match(quickStart, /Docker installation/i);
  assert.match(quickStart, /upgrade/i);
  assert.match(quickStart, /rollback/i);
  assert.match(quickStart, /security/i);
  assert.match(limitations, /actor identity is caller-asserted/i);
  assert.match(limitations, /not externally witnessed/i);
  assert.match(limitations, /Browser binaries are not bundled/i);
  assert.match(limitations, /Native desktop drivers are not universally bundled/i);
  assert.match(limitations, /single-node/i);
  assert.match(limitations, /Breaking changes remain possible/i);
  assert.match(limitations, /npm publication may be unavailable/i);
  assert.match(limitations, /Phase 11/i);
});
