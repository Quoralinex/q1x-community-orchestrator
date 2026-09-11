import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const cli = join(root, 'packages/runtime/dist/cli.js');
const missionFile = join(root, 'examples/company-launch/mission.json');

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

function success(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function tempDir(t, prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
test('backup CLI creates verifies and restores without pre-opening the target home', async t => {
  const source = await tempDir(t, 'q1x-backup-cli-source-');
  const output = await tempDir(t, 'q1x-backup-cli-output-');
  const target = join(output, 'restored-home');
  const mission = success(run('--home', source, 'mission', 'put', '--file', missionFile));

  const created = success(run('--home', source, 'backup', 'create', '--output', output));
  assert.equal(created.schema, 'q1x.runtime-backup-cli.v1');
  assert.equal(created.action, 'create');
  assert.equal(created.stateSchemaVersion, 1);
  assert.equal(created.valid, true);

  const verified = success(run('backup', 'verify', created.backupPath));
  assert.equal(verified.schema, 'q1x.runtime-backup-cli.v1');
  assert.equal(verified.action, 'verify');
  assert.equal(verified.valid, true);

  const restored = success(run('backup', 'restore', created.backupPath, '--home', target));
  assert.equal(restored.action, 'restore');
  assert.equal(restored.targetHome, target);
  assert.equal(restored.valid, true);
  assert.deepEqual(restored.nextActions, ['audit verify', 'recovery reconcile', 'status']);
  assert.equal(success(run('--home', target, 'mission', 'show', mission.id)).id, mission.id);
});
