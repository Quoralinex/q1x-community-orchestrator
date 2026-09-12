import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const cli = join(root, 'packages/runtime/dist/cli.js');

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}
function success(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
async function tempHome(t, prefix = 'q1x-migration-cli-') {
  const home = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}
function seedLegacyAlpha2(home) {
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
  db.close();
}
function tableExists(home, table) {
  const db = new DatabaseSync(join(home, 'state.sqlite'));
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  db.close();
  return Boolean(row);
}

test('migration CLI inspects compatibility and dry-runs legacy state without mutation', async t => {
  const home = await tempHome(t);
  seedLegacyAlpha2(home);

  const inspected = success(run('--home', home, 'migration', 'inspect'));
  assert.equal(inspected.schema, 'q1x.runtime-migration-cli.v1');
  assert.equal(inspected.action, 'inspect');
  assert.equal(inspected.state, 'migration-required');
  assert.equal(inspected.sourceSchemaVersion, null);
  assert.equal(inspected.targetSchemaVersion, 1);
  assert.deepEqual(inspected.steps, ['legacy-unversioned-to-v1']);

  const compatibility = success(run('--home', home, 'migration', 'compatibility'));
  assert.equal(compatibility.schema, 'q1x.runtime-migration-cli.v1');
  assert.equal(compatibility.action, 'compatibility');
  assert.equal(compatibility.compatible, true);
  assert.equal(compatibility.state, 'migration-required');

  const dryRun = success(run('--home', home, 'migration', 'dry-run'));
  assert.equal(dryRun.schema, 'q1x.runtime-migration-cli.v1');
  assert.equal(dryRun.action, 'dry-run');
  assert.equal(dryRun.applied, false);
  assert.deepEqual(dryRun.steps, ['legacy-unversioned-to-v1']);
  assert.equal(tableExists(home, 'runtime_metadata'), false);
});

test('migration CLI applies legacy state and records metadata-only audit evidence', async t => {
  const home = await tempHome(t);
  seedLegacyAlpha2(home);

  const applied = success(run('--home', home, 'migration', 'apply'));
  assert.equal(applied.schema, 'q1x.runtime-migration-cli.v1');
  assert.equal(applied.action, 'apply');
  assert.equal(applied.applied, true);
  assert.equal(applied.sourceSchemaVersion, null);
  assert.equal(applied.targetSchemaVersion, 1);
  assert.deepEqual(applied.steps, ['legacy-unversioned-to-v1']);
  assert.match(applied.auditReceiptId, /^audit\./);
  assert.equal(JSON.stringify(applied).includes(home), false);

  const receipts = success(run('--home', home, 'audit', 'list'));
  const receipt = receipts.find(item => item.eventType === 'state.migration.applied');
  assert.ok(receipt);
  assert.equal(receipt.subject.id, 'runtime.state');
  assert.equal(receipt.subject.kind, 'runtime-state');
  assert.deepEqual(receipt.metadata.migrationIds, ['legacy-unversioned-to-v1']);
  assert.equal(receipt.metadata.sourceSchemaVersion, null);
  assert.equal(receipt.metadata.targetSchemaVersion, 1);
  assert.equal('backupPath' in receipt.metadata, false);
  assert.equal(JSON.stringify(receipt).includes(home), false);
  assert.deepEqual(success(run('--home', home, 'audit', 'verify')), { valid: true, checked: receipts.length });
});

test('migration commands are part of the machine-readable CLI catalogue', async t => {
  const home = await tempHome(t);
  const help = success(run('--home', home, 'help'));
  const usages = help.commands.map(item => item.usage);
  assert.ok(usages.includes('q1x --home <path> migration inspect'));
  assert.ok(usages.includes('q1x --home <path> migration compatibility'));
  assert.ok(usages.includes('q1x --home <path> migration dry-run [--backup <path>]'));
  assert.ok(usages.includes('q1x --home <path> migration apply [--backup <path>]'));
});
