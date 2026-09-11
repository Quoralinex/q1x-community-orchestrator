import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const TEST_SHA = 'a'.repeat(40);

async function upgradeModule() {
  return import('../scripts/phase14/run-upgrade-matrix.mjs');
}

test('Phase 14 upgrade matrix proves fresh Alpha 2 and Phase 13 state paths', async () => {
  const { runUpgradeMatrix } = await upgradeModule();
  const report = await runUpgradeMatrix({ sourceSha: TEST_SHA });

  assert.equal(report.schema, 'q1x.phase14-upgrade-evidence.v1');
  assert.equal(report.sourceSha, TEST_SHA);
  assert.deepEqual(report.cases.map(item => item.sourceRelease), [
    'fresh', 'v0.1.0-alpha.2', '0.2.0-beta.1',
  ]);
  assert.deepEqual(report.cases.map(item => item.sourceSchemaVersion), [null, null, 1]);
  assert.ok(report.cases.every(item => item.targetSchemaVersion === 1));
  assert.deepEqual(report.cases[0].migrationSteps, []);
  assert.deepEqual(report.cases[1].migrationSteps, ['legacy-unversioned-to-v1']);
  assert.deepEqual(report.cases[2].migrationSteps, []);
  assert.equal(report.cases[0].fixtureSha256, null);
  assert.ok(report.cases.slice(1).every(item => /^[0-9a-f]{64}$/.test(item.fixtureSha256)));
  assert.ok(report.cases.every(item => item.sqliteIntegrity === 'ok'));
  assert.ok(report.cases.every(item => item.auditValid === true));
  assert.ok(report.cases.every(item => item.readWriteVerified === true));
  assert.ok(report.cases.every(item => item.backupVerified === true));
  assert.ok(report.cases.every(item => item.restoreVerified === true));
  assert.ok(report.cases.every(item => item.state === 'passed'));
  assert.equal(report.externalProviderCalls, 0);
  assert.equal(report.state, 'passed');
});

test('Phase 14 upgrade evidence proves failed migration is transactionally recoverable', async () => {
  const { runUpgradeMatrix } = await upgradeModule();
  const report = await runUpgradeMatrix({ sourceSha: TEST_SHA });
  assert.deepEqual(report.failureRecovery, {
    sourceRelease: 'v0.1.0-alpha.2',
    errorCode: 'MIGRATION_FAILED',
    schemaMarkerPresent: false,
    partialWritePresent: false,
    recoveryOutcome: 'transaction-rolled-back',
    state: 'passed',
  });
});

test('Phase 14 retained state recipes are deterministic metadata-only fixtures', async () => {
  const manifest = JSON.parse(await readFile(new URL('fixtures/state/fixture-manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.schema, 'q1x.phase14-state-fixtures.v1');
  assert.deepEqual(manifest.fixtures.map(item => item.release), ['v0.1.0-alpha.2', '0.2.0-beta.1']);
  for (const fixture of manifest.fixtures) {
    assert.match(fixture.sha256, /^[0-9a-f]{64}$/);
    assert.match(fixture.recipe, /^tests\/fixtures\/state\//);
    const sql = await readFile(new URL(`../${fixture.recipe}`, import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /\/Users\/|password|secret|token|api[_-]?key|prompt/i);
  }
});
