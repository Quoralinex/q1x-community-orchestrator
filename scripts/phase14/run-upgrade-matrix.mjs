import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));
const fixtureDir = join(root, 'tests/fixtures/state');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
async function loadFixtures() {
  const manifest = JSON.parse(await readFile(join(fixtureDir, 'fixture-manifest.json'), 'utf8'));
  if (manifest?.schema !== 'q1x.phase14-state-fixtures.v1' || !Array.isArray(manifest.fixtures)) {
    throw new Error('Phase 14 fixture manifest is invalid');
  }
  const byRelease = new Map();
  for (const fixture of manifest.fixtures) {
    const recipePath = resolve(root, fixture.recipe);
    const sql = await readFile(recipePath, 'utf8');
    if (sha256(sql) !== fixture.sha256) throw new Error(`Fixture digest mismatch: ${fixture.release}`);
    byRelease.set(fixture.release, { ...fixture, sql });
  }
  return byRelease;
}
function materializeSql(home, sql) {
  const db = new DatabaseSync(join(home, 'state.sqlite'));
  try { db.exec(sql); } finally { db.close(); }
}
function tableExists(home, name) {
  const db = new DatabaseSync(join(home, 'state.sqlite'));
  try { return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
  finally { db.close(); }
}
async function examples() {
  const read = async name => JSON.parse(await readFile(join(root, 'examples/company-launch', name), 'utf8'));
  return { mission: await read('mission.json'), programme: await read('programme.json'), graph: await read('work-graph.json') };
}
async function exerciseCase({ sourceRelease, fixture, sourceSha, runtimeApi, migrations }) {
  const home = await mkdtemp(join(tmpdir(), 'q1x-phase14-upgrade-'));
  const backupRoot = await mkdtemp(join(tmpdir(), 'q1x-phase14-upgrade-backup-'));
  const restoreRoot = await mkdtemp(join(tmpdir(), 'q1x-phase14-upgrade-restore-'));
  const restoreHome = join(restoreRoot, 'home');
  try {
    if (fixture) materializeSql(home, fixture.sql);
    const inspection = migrations.inspectRuntimeState(home);
    const plan = migrations.planStateMigration(home);
    if (inspection.state === 'migration-required') await migrations.applyStateMigrations(home);
    else if (!['fresh', 'current'].includes(inspection.state)) throw new Error(`Unsupported fixture state: ${inspection.state}`);

    const docs = await examples();
    const runtime = runtimeApi.OpenControlRuntime.open({ home });
    runtime.putMission(docs.mission);
    runtime.putProgramme(docs.programme);
    runtime.putWorkGraph(docs.graph);
    const readWriteVerified = runtime.getMission(docs.mission.id)?.id === docs.mission.id
      && runtime.getProgramme(docs.programme.id)?.id === docs.programme.id
      && runtime.getWorkGraph(docs.graph.id)?.id === docs.graph.id;
    runtime.appendAuditReceipt('upgrade.matrix.verified', { id: docs.programme.id, kind: 'programme' }, docs.programme.id, { sourceRelease, sourceSha });
    const auditValid = runtime.verifyAuditChain().valid;
    runtime.close();

    const store = runtimeApi.SqliteStore.open(home);
    const sqliteIntegrity = store.verifyIntegrity().message;
    store.close();
    const backup = await runtimeApi.createRuntimeBackup(home, backupRoot);
    const backupVerified = (await runtimeApi.verifyRuntimeBackup(backup.directory)).valid;
    await runtimeApi.restoreRuntimeBackup(backup.directory, restoreHome);
    const restored = runtimeApi.OpenControlRuntime.open({ home: restoreHome });
    const restoreVerified = restored.getMission(docs.mission.id)?.id === docs.mission.id
      && restored.getProgramme(docs.programme.id)?.id === docs.programme.id
      && restored.getWorkGraph(docs.graph.id)?.id === docs.graph.id
      && restored.verifyAuditChain().valid;
    restored.close();
    const restoredStore = runtimeApi.SqliteStore.open(restoreHome);
    const restoredIntegrity = restoredStore.verifyIntegrity().ok;
    restoredStore.close();

    const state = sqliteIntegrity === 'ok' && auditValid && readWriteVerified && backupVerified && restoreVerified && restoredIntegrity
      ? 'passed' : 'failed';
    return {
      sourceRelease,
      sourceSchemaVersion: inspection.sourceSchemaVersion,
      targetSchemaVersion: 1,
      migrationSteps: plan.steps.map(step => step.id),
      fixtureSha256: fixture?.sha256 ?? null,
      sqliteIntegrity,
      auditValid,
      readWriteVerified: Boolean(readWriteVerified),
      backupVerified,
      restoreVerified: Boolean(restoreVerified && restoredIntegrity),
      state,
    };
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(backupRoot, { recursive: true, force: true });
    await rm(restoreRoot, { recursive: true, force: true });
  }
}
async function failureRecovery(fixture, migrations, runtimeApi) {
  const home = await mkdtemp(join(tmpdir(), 'q1x-phase14-migration-failure-'));
  try {
    materializeSql(home, fixture.sql);
    const registry = [{
      id: 'test-legacy-failure', source: 'legacy-unversioned', target: 1, destructive: false,
      precondition() {},
      apply(db) {
        db.exec('CREATE TABLE migration_probe (value TEXT NOT NULL);');
        db.prepare('INSERT INTO migration_probe(value) VALUES (?)').run('partial');
        throw new Error('deliberate Phase 14 fixture failure');
      },
      verify() {},
    }];
    let errorCode;
    try { await migrations.applyStateMigrationsWithRegistry(home, registry, {}); }
    catch (error) { errorCode = error instanceof runtimeApi.RuntimeError ? error.code : 'UNKNOWN'; }
    return {
      sourceRelease: 'v0.1.0-alpha.2',
      errorCode,
      schemaMarkerPresent: tableExists(home, 'runtime_metadata'),
      partialWritePresent: tableExists(home, 'migration_probe'),
      recoveryOutcome: !tableExists(home, 'runtime_metadata') && !tableExists(home, 'migration_probe') ? 'transaction-rolled-back' : 'recovery-failed',
      state: errorCode === 'MIGRATION_FAILED' && !tableExists(home, 'runtime_metadata') && !tableExists(home, 'migration_probe') ? 'passed' : 'failed',
    };
  } finally { await rm(home, { recursive: true, force: true }); }
}
export async function runUpgradeMatrix({ sourceSha }) {
  if (!/^[0-9a-f]{40}$/.test(sourceSha ?? '')) throw new Error('A 40-character source SHA is required');
  const fixtures = await loadFixtures();
  const runtimeApi = await import('../../packages/runtime/dist/index.js');
  const migrations = await import('../../packages/runtime/dist/state-migrations.js');
  const cases = [];
  cases.push(await exerciseCase({ sourceRelease: 'fresh', sourceSha, runtimeApi, migrations }));
  for (const sourceRelease of ['v0.1.0-alpha.2', '0.2.0-beta.1']) {
    const fixture = fixtures.get(sourceRelease);
    if (!fixture) throw new Error(`Missing fixture: ${sourceRelease}`);
    cases.push(await exerciseCase({ sourceRelease, fixture, sourceSha, runtimeApi, migrations }));
  }
  const recovery = await failureRecovery(fixtures.get('v0.1.0-alpha.2'), migrations, runtimeApi);
  return {
    schema: 'q1x.phase14-upgrade-evidence.v1', sourceSha, cases,
    failureRecovery: recovery, externalProviderCalls: 0,
    state: cases.every(item => item.state === 'passed') && recovery.state === 'passed' ? 'passed' : 'failed',
  };
}
function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const sourceSha = arg('--source-sha');
  const output = arg('--output');
  const report = await runUpgradeMatrix({ sourceSha });
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (output) await writeFile(resolve(output), text);
  else process.stdout.write(text);
  if (report.state !== 'passed') process.exitCode = 1;
}
