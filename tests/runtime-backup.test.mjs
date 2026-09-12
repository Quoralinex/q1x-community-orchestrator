import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
async function module() { return import('../packages/runtime/dist/index.js'); }

async function tempDir(t, prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function seededRuntimeHome(t) {
  const home = await tempDir(t, 'q1x-backup-source-');
  const { OpenControlRuntime } = await module();
  const runtime = OpenControlRuntime.open({ home });
  const mission = await json('examples/company-launch/mission.json');
  runtime.putMission(mission);
  runtime.appendAuditReceipt('backup.test', { id: mission.id, kind: 'mission' }, undefined, { fixture: true });
  runtime.close();
  return { home, mission };
}
test('backup round-trip preserves state and audit integrity', async t => {
  const { home, mission } = await seededRuntimeHome(t);
  const output = await tempDir(t, 'q1x-backup-output-');
  const target = join(output, 'restored-home');
  const { createRuntimeBackup, verifyRuntimeBackup, restoreRuntimeBackup, digestRuntimeBackup, OpenControlRuntime, SecurityAuditStore } = await module();

  const backup = await createRuntimeBackup(home, output);
  assert.equal(backup.schema, 'q1x.runtime-backup.v1');
  assert.equal(backup.stateSchemaVersion, 1);
  assert.equal(backup.sqliteIntegrity, 'ok');
  assert.equal(backup.files.length, 1);
  assert.equal(backup.files[0].path, 'state.sqlite');

  const verification = await verifyRuntimeBackup(backup.directory);
  assert.equal(verification.valid, true);
  assert.deepEqual(verification.findings, []);

  const firstDigest = await digestRuntimeBackup(backup.directory);
  assert.match(firstDigest, /^[0-9a-f]{64}$/);
  const manifestPath = join(backup.directory, 'backup-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.createdAt = '2099-01-01T00:00:00.000Z';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.equal(await digestRuntimeBackup(backup.directory), firstDigest);

  const restored = await restoreRuntimeBackup(backup.directory, target);
  assert.equal(restored.stateSchemaVersion, 1);
  const runtime = OpenControlRuntime.open({ home: target });
  assert.deepEqual(runtime.getMission(mission.id), mission);
  runtime.close();
  const audit = SecurityAuditStore.open(target);
  assert.equal(audit.verify().valid, true);
  assert.equal(audit.list().length, 1);
  audit.close();

  const manifestText = await readFile(join(backup.directory, 'backup-manifest.json'), 'utf8');
  assert.equal(manifestText.includes(home), false);
  assert.deepEqual((await readdir(backup.directory)).sort(), ['backup-manifest.json', 'state.sqlite']);
});

test('verification and restore reject corruption and non-empty targets', async t => {
  const { home } = await seededRuntimeHome(t);
  const output = await tempDir(t, 'q1x-backup-corrupt-');
  const { createRuntimeBackup, verifyRuntimeBackup, restoreRuntimeBackup, digestRuntimeBackup, RuntimeError } = await module();
  const backup = await createRuntimeBackup(home, output);

  await writeFile(join(backup.directory, 'state.sqlite'), Buffer.from('corrupted'));
  const verification = await verifyRuntimeBackup(backup.directory);
  assert.equal(verification.valid, false);
  await assert.rejects(() => digestRuntimeBackup(backup.directory), error =>
    error instanceof RuntimeError && error.code === 'BACKUP_INTEGRITY_FAILED');
  assert.ok(verification.findings.length > 0);
  await assert.rejects(
    () => restoreRuntimeBackup(backup.directory, join(output, 'restore-corrupt')),
    error => error instanceof RuntimeError && error.code === 'BACKUP_INTEGRITY_FAILED'
  );
  const cleanBackup = await createRuntimeBackup(home, output);
  const nonEmpty = join(output, 'non-empty-target');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(nonEmpty, { recursive: true });
  await writeFile(join(nonEmpty, 'keep.txt'), 'keep');
  await assert.rejects(
    () => restoreRuntimeBackup(cleanBackup.directory, nonEmpty),
    error => error instanceof RuntimeError && error.code === 'BACKUP_TARGET_NOT_EMPTY'
  );
  assert.equal(await readFile(join(nonEmpty, 'keep.txt'), 'utf8'), 'keep');
});

test('verification rejects unmanifested files', async t => {
  const { home } = await seededRuntimeHome(t);
  const output = await tempDir(t, 'q1x-backup-extra-');
  const { createRuntimeBackup, verifyRuntimeBackup, digestRuntimeBackup, RuntimeError } = await module();
  const backup = await createRuntimeBackup(home, output);
  await writeFile(join(backup.directory, 'unexpected.txt'), 'unexpected');
  const verification = await verifyRuntimeBackup(backup.directory);
  assert.equal(verification.valid, false);
  await assert.rejects(() => digestRuntimeBackup(backup.directory), error =>
    error instanceof RuntimeError && error.code === 'BACKUP_INTEGRITY_FAILED');
  assert.ok(verification.findings.some(item => /unexpected/i.test(item)));
});
