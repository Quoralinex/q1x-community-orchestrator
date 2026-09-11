import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
async function module() { return import('../packages/runtime/dist/index.js'); }

function tempHome(t) {
  const home = join(tmpdir(), `q1x-state-version-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

function seedFutureState(home, version) {
  const db = new DatabaseSync(join(home, 'state.sqlite'));
  db.exec('CREATE TABLE runtime_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  db.prepare('INSERT INTO runtime_metadata (key, value) VALUES (?, ?)').run('state_schema_version', String(version));
  db.close();
}
async function seedAlpha2State(home) {
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
test('new runtime homes persist the current state schema marker', async t => {
  const home = tempHome(t);
  const { OpenControlRuntime, CURRENT_STATE_SCHEMA_VERSION, classifyStateSchema } = await module();
  const runtime = OpenControlRuntime.open({ home });
  assert.equal(CURRENT_STATE_SCHEMA_VERSION, 1);
  assert.equal(classifyStateSchema(1), 'current');
  assert.equal(classifyStateSchema(0), 'upgradeable');
  assert.equal(classifyStateSchema(999), 'future');
  assert.equal(runtime.getStateSchemaVersion(), 1);
  runtime.close();

  const db = new DatabaseSync(join(home, 'state.sqlite'));
  const row = db.prepare("SELECT value FROM runtime_metadata WHERE key='state_schema_version'").get();
  db.close();
  assert.equal(row.value, '1');
});

test('future state schema fails closed before normal runtime schema is exposed', async t => {
  const home = tempHome(t);
  const { mkdir } = await import('node:fs/promises');
  await mkdir(home, { recursive: true });
  seedFutureState(home, 999);
  const { OpenControlRuntime, RuntimeError } = await module();
  assert.throws(() => OpenControlRuntime.open({ home }), error =>
    error instanceof RuntimeError && error.code === 'INCOMPATIBLE_STATE');
  const db = new DatabaseSync(join(home, 'state.sqlite'));
  const row = db.prepare("SELECT value FROM runtime_metadata WHERE key='state_schema_version'").get();
  const normalTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_versions'").get();
  db.close();
  assert.equal(row.value, '999');
  assert.equal(normalTable, undefined);
});

test('Alpha 2 state without metadata is adopted additively and remains readable', async t => {
  const home = tempHome(t);
  const { mkdir } = await import('node:fs/promises');
  await mkdir(home, { recursive: true });
  const { mission, programme } = await seedAlpha2State(home);
  const { OpenControlRuntime } = await module();
  const runtime = OpenControlRuntime.open({ home });
  assert.equal(runtime.getStateSchemaVersion(), 1);
  assert.deepEqual(runtime.getMission(mission.id), mission);
  assert.deepEqual(runtime.getProgramme(programme.id), programme);
  runtime.close();
});

test('sqlite integrity helper reports a healthy runtime state', async t => {
  const home = tempHome(t);
  const { SqliteStore } = await module();
  const store = SqliteStore.open(home);
  assert.deepEqual(store.verifyIntegrity(), { ok: true, message: 'ok' });
  store.close();
});
