import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const docs = new URL('../docs/', import.meta.url);
const read = async name => readFile(new URL(name, docs), 'utf8');
const REQUIRED = [
  'versioning.md', 'deprecation-policy.md', 'upgrade-rollback.md',
  'supported-platforms.md', 'stable-release.md',
];

test('Phase 14 stable policy document set exists with explicit RC and commissioning boundaries', async () => {
  const contents = Object.fromEntries(await Promise.all(REQUIRED.map(async name => [name, await read(name)])));
  const active = [
    await read('../README.md'), await read('index.md'), await read('roadmap.md'),
    await read('known-limitations.md'), ...Object.values(contents),
  ].join('\n');
  assert.match(active, /1\.0\.0-rc\.1/);
  assert.match(active, /1\.0\.0[^\n]{0,120}not commissioned/i);
  assert.doesNotMatch(active, /current commissioned stable release is[^\n]*1\.0\.0/i);
  assert.doesNotMatch(active, /1\.0\.0 has been released/i);
  assert.match(active, /PolyForm Noncommercial License 1\.0\.0/i);
});

test('stable versioning and deprecation policy define the governed compatibility promise', async () => {
  const versioning = await read('versioning.md');
  const deprecation = await read('deprecation-policy.md');
  assert.match(versioning, /semantic versioning|SemVer/i);
  assert.match(versioning, /breaking[^\n]{0,100}major/i);
  assert.match(versioning, /public-surface\.rc1\.json/);
  assert.match(versioning, /package-surface\.rc1\.json/);
  assert.match(versioning, /does not[^\n]{0,120}enterprise IAM|not[^\n]{0,120}SLA/i);
  assert.match(deprecation, /replacement/i);
  assert.match(deprecation, /migration guidance/i);
  assert.match(deprecation, /minor[^\n]{0,120}must not[^\n]{0,120}remove|must not[^\n]{0,120}minor/i);
  assert.match(deprecation, /patch[^\n]{0,120}must not[^\n]{0,120}remove|must not[^\n]{0,120}patch/i);
});

test('upgrade rollback and supported-platform guidance is evidence bounded', async () => {
  const upgrade = await read('upgrade-rollback.md');
  const platforms = await read('supported-platforms.md');
  assert.match(upgrade, /migration inspect/);
  assert.match(upgrade, /migration dry-run/);
  assert.match(upgrade, /migration apply/);
  assert.match(upgrade, /verified backup/i);
  assert.match(upgrade, /backup restore/i);
  assert.match(upgrade, /rollback/i);
  assert.match(platforms, /compatibility matrix/i);
  assert.match(platforms, /tested/i);
  assert.match(platforms, /experimental/i);
  assert.match(platforms, /unsupported/i);
  assert.match(platforms, /browser binaries[^\n]{0,120}not bundled/i);
});

test('stable release page states required evidence and explicit nonclaims', async () => {
  const stable = await read('stable-release.md');
  assert.match(stable, /1\.0\.0-rc\.1/);
  assert.match(stable, /six[- ]hour|360 minute/i);
  assert.match(stable, /1,?000[^\n]{0,80}restart/i);
  assert.match(stable, /SBOM/i);
  assert.match(stable, /dependency|licen[cs]e/i);
  assert.match(stable, /not commissioned/i);
  assert.match(stable, /no[^\n]{0,120}(production|SLA)|not[^\n]{0,120}(production|SLA)/i);
});

test('historical public alpha documentation remains byte-for-byte unchanged', async () => {
  const bytes = await readFile(new URL('public-alpha.md', docs));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'd1db7df74989bb58b0eb4ccf9f00ec9d63ae3b67902972633b0e085fdea4f06a',
  );
});

test('active navigation exposes Phase 14 while prerelease remains historical Phase 13 context', async () => {
  const readme = await read('../README.md');
  const index = await read('index.md');
  const roadmap = await read('roadmap.md');
  const limits = await read('known-limitations.md');
  const prerelease = await read('prerelease.md');
  for (const text of [readme, index, roadmap, limits]) assert.match(text, /Phase 14|1\.0\.0-rc\.1/);
  assert.match(prerelease, /stable-release\.md/);
  assert.match(prerelease, /historical|Phase 13/i);
  assert.match(prerelease, /0\.2\.0-beta\.1/);
});

test('active developer and compatibility docs label Alpha and Beta evidence as historical under the RC identity', async () => {
  const developer = await read('developer-guide.md');
  const matrix = await read('compatibility-matrix.md');
  assert.doesNotMatch(developer, /commissioned Alpha 2 source manifests remain unchanged in the repository/i);
  assert.doesNotMatch(developer, /Keep source manifests on the commissioned release identity/i);
  assert.match(developer, /historical[^\n]{0,160}Alpha 2|Alpha 2[^\n]{0,160}historical/i);
  assert.match(developer, /1\.0\.0-rc\.1/);
  assert.doesNotMatch(matrix, /Current beta-candidate package-consumer identity/i);
  assert.match(matrix, /Historical[^\n]{0,160}beta-candidate package-consumer identity/i);
});

test('Phase 14 implementation plan uses executable long-evidence CLI syntax', async () => {
  const plan = await read('../docs/superpowers/plans/2026-09-11-phase14-stable-release-readiness.md');
  assert.doesNotMatch(plan, /runtime-equivalence\.mjs --base/);
  assert.doesNotMatch(plan, /runtime-equivalence\.mjs[^\n]*--head/);
  assert.doesNotMatch(plan, /run-soak\.mjs[^\n]*--output/);
  assert.doesNotMatch(plan, /run-restart-campaign\.mjs[^\n]*--output/);
  assert.match(plan, /runtime-equivalence\.mjs --from[^\n]*--to[^\n]*>/);
});

test('active status docs record completed Phase 14 stable-readiness without claiming stable commissioning', async () => {
  const readme = await read('../README.md');
  const index = await read('index.md');
  const roadmap = await read('roadmap.md');
  const stable = await read('stable-release.md');
  const limits = await read('known-limitations.md');
  for (const text of [readme, index, roadmap, stable, limits]) {
    assert.doesNotMatch(text, /Phase 14[^\n]{0,180}(prepares|in delivery)/i);
    assert.match(text, /Phase 14[^\n]{0,220}(implemented|completed|validated|stable-readiness)/i);
    assert.match(text, /1\.0\.0[^\n]{0,180}not commissioned/i);
  }
  assert.match(readme, /Phases 1–14 are implemented on protected `main`/i);
  assert.match(roadmap, /Phase 14[^\n]{0,260}implemented(?: and validated)? on protected `main`/i);
  assert.match(stable, /validation-only[^\n]{0,180}(passed|green)|validated[^\n]{0,180}stable/i);
});
