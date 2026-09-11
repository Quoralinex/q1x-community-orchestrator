import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
async function runtimeModule() { return import('../packages/runtime/dist/index.js'); }
async function migrationModule() { return import('../packages/runtime/dist/state-migrations.js'); }

function tempHome(t) {
  const home = join(tmpdir(), `q1x-state-migration-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

async function seedLegacyAlpha2(home) {
  await mkdir(home, { recursive: true });
  const mission = await json('examples/company-launch/mission.json');
  const programme = await json('examples/company-launch/programme.json');
  const db = new DatabaseSync(join(home, 'state.sqlite'));
  db.exec(`
    CREATE TABLE document_versions (
      kind TEXT NOT NULL, id TEXT NOT NULL, storage_revision INTEGER NOT NULL,
      scope_id TEXT, document_json TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY (kind, id, storage_revision)
    );
    CREATE TABLE document_heads (
      kind TEXT NOT NULL, id TEXT NOT NULL, storage_revision INTEGER NOT NULL,
      scope_id TEXT, PRIMARY KEY (kind, id)
    );
  `);
  const putVersion = db.prepare('INSERT INTO document_versions (kind,id,storage_revision,scope_id,document_json,created_at) VALUES (?,?,?,?,?,?)');
  const putHead = db.prepare('INSERT INTO document_heads (kind,id,storage_revision,scope_id) VALUES (?,?,?,?)');
  putVersion.run('mission', mission.id, 1, null, JSON.stringify(mission), '2026-09-10T00:00:00Z');
  putHead.run('mission', mission.id, 1, null);
  putVersion.run('programme', programme.id, 1, programme.id, JSON.stringify(programme), '2026-09-10T00:00:00Z');
  putHead.run('programme', programme.id, 1, programme.id);
  db.close();
  return { mission, programme };
}

async function seedVersionedState(home, version) {
  await mkdir(home, { recursive: true });
  const db = new DatabaseSync(join(home, 'state.sqlite'));
  db.exec('CREATE TABLE runtime_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  db.prepare('INSERT INTO runtime_metadata (key, value) VALUES (?, ?)').run('state_schema_version', String(version));
  db.close();
}

function readMarker(home) {
  const db = new DatabaseSync(join(home, 'state.sqlite'));
  let value;
  try { value = db.prepare("SELECT value FROM runtime_metadata WHERE key='state_schema_version'").get()?.value; } catch {}
  db.close();
  return value;
}

function tableExists(home, name) {
  const db = new DatabaseSync(join(home, 'state.sqlite'));
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  db.close();
  return Boolean(row);
}

test('migration inspection distinguishes fresh current legacy and future state without mutation', async t => {
  const fresh = tempHome(t);
  const current = tempHome(t);
  const legacy = tempHome(t);
  const future = tempHome(t);
  const { SqliteStore } = await runtimeModule();
  const { inspectRuntimeState, planStateMigration } = await migrationModule();

  const currentStore = SqliteStore.open(current);
  currentStore.close();
  await seedLegacyAlpha2(legacy);
  await seedVersionedState(future, 2);

  assert.deepEqual(inspectRuntimeState(fresh), {
    schema: 'q1x.runtime-state-inspection.v1', state: 'fresh', sourceSchemaVersion: null,
    targetSchemaVersion: 1, steps: [],
  });
  assert.equal(inspectRuntimeState(current).state, 'current');
  const legacyInspection = inspectRuntimeState(legacy);
  assert.equal(legacyInspection.state, 'migration-required');
  assert.equal(legacyInspection.sourceSchemaVersion, null);
  assert.deepEqual(legacyInspection.steps, ['legacy-unversioned-to-v1']);
  assert.equal(tableExists(legacy, 'runtime_metadata'), false);
  assert.equal(inspectRuntimeState(future).state, 'future');
  assert.deepEqual(planStateMigration(legacy).steps.map(step => step.id), ['legacy-unversioned-to-v1']);
});

test('legacy Alpha 2 migration is explicit additive and preserves readable state', async t => {
  const home = tempHome(t);
  const { mission, programme } = await seedLegacyAlpha2(home);
  const { OpenControlRuntime } = await runtimeModule();
  const { applyStateMigrations } = await migrationModule();

  const dryRun = await applyStateMigrations(home, { dryRun: true });
  assert.equal(dryRun.applied, false);
  assert.equal(tableExists(home, 'runtime_metadata'), false);

  const result = await applyStateMigrations(home);
  assert.equal(result.schema, 'q1x.runtime-state-migration-result.v1');
  assert.equal(result.applied, true);
  assert.equal(result.sourceSchemaVersion, null);
  assert.equal(result.targetSchemaVersion, 1);
  assert.deepEqual(result.steps, ['legacy-unversioned-to-v1']);
  assert.equal(readMarker(home), '1');

  const runtime = OpenControlRuntime.open({ home });
  assert.deepEqual(runtime.getMission(mission.id), mission);
  assert.deepEqual(runtime.getProgramme(programme.id), programme);
  runtime.close();
});

test('migration failure rolls back writes and schema marker atomically', async t => {
  const home = tempHome(t);
  await seedVersionedState(home, 0);
  const { RuntimeError } = await runtimeModule();
  const { applyStateMigrationsWithRegistry } = await migrationModule();
  const failingRegistry = [{
    id: 'test-v0-to-v1', source: 0, target: 1, destructive: false,
    precondition() {},
    apply(db) {
      db.exec('CREATE TABLE migration_probe (value TEXT NOT NULL);');
      db.prepare('INSERT INTO migration_probe(value) VALUES (?)').run('partial');
      throw new Error('deliberate test failure');
    },
    verify() {},
  }];

  await assert.rejects(() => applyStateMigrationsWithRegistry(home, failingRegistry, {}), error =>
    error instanceof RuntimeError && error.code === 'MIGRATION_FAILED');
  assert.equal(readMarker(home), '0');
  assert.equal(tableExists(home, 'migration_probe'), false);
});
