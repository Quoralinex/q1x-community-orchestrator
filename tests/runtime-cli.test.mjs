import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const cli = join(root, 'packages/runtime/dist/cli.js');
const example = name => join(root, 'examples/company-launch', name);

function run(home, ...args) {
  return spawnSync(process.execPath, [cli, '--home', home, ...args], { encoding: 'utf8' });
}

function success(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('q1x CLI performs core runtime round trips', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-runtime-cli-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  assert.equal(success(run(home, 'init')).contractVersion, '1.0.0');

  const mission = success(run(home, 'mission', 'put', '--file', example('mission.json')));
  assert.equal(mission.id, 'mission.company-launch');
  assert.equal(success(run(home, 'mission', 'list')).length, 1);
  assert.equal(success(run(home, 'mission', 'show', mission.id)).id, mission.id);

  const programme = success(run(home, 'programme', 'put', '--file', example('programme.json')));
  assert.equal(programme.id, 'programme.company-launch');
  const graph = success(run(home, 'graph', 'put', '--file', example('work-graph.json')));
  assert.equal(graph.id, 'graph.company-launch');

  const checkpoint = success(run(home, 'checkpoint', 'create', programme.id, '--id', 'checkpoint.cli.1'));
  assert.equal(checkpoint.workGraphRevision, 1);
  assert.equal(success(run(home, 'checkpoint', 'list', '--programme', programme.id)).length, 1);
  assert.equal(success(run(home, 'checkpoint', 'restore', checkpoint.id)).id, checkpoint.id);
  assert.equal(success(run(home, 'status', '--programme', programme.id)).counts.workGraphs, 1);
});

test('q1x CLI returns structured errors without stack traces', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-runtime-cli-error-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const result = run(home, 'mission', 'show', 'mission.missing');
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stderr);
  assert.equal(payload.error.code, 'NOT_FOUND');
  assert.match(payload.error.message, /mission/i);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});
