import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'q1x-runtime-service-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime } = await import('../packages/runtime/dist/index.js');
  return { home, runtime: OpenControlRuntime.open({ home }) };
}

test('runtime persists mission, programme and work graph contracts', async t => {
  const { runtime } = await fixture(t);
  t.after(() => runtime.close());
  const mission = await json('examples/company-launch/mission.json');
  const programme = await json('examples/company-launch/programme.json');
  const graph = await json('examples/company-launch/work-graph.json');
  runtime.putMission(mission);
  runtime.putProgramme(programme);
  runtime.putWorkGraph(graph);
  assert.deepEqual(runtime.getMission(mission.id), mission);
  assert.deepEqual(runtime.getProgramme(programme.id), programme);
  assert.deepEqual(runtime.getWorkGraph(graph.id), graph);
});

test('runtime rejects missing references and invalid revisions', async t => {
  const { runtime } = await fixture(t);
  t.after(() => runtime.close());
  const mission = await json('examples/company-launch/mission.json');
  const programme = await json('examples/company-launch/programme.json');
  runtime.putMission(mission);
  assert.throws(
    () => runtime.putProgramme({ ...programme, id: 'programme.orphan', missionId: 'mission.missing' }),
    error => error?.code === 'INVALID_REFERENCE'
  );
  runtime.putProgramme(programme);
  assert.throws(
    () => runtime.putProgramme({ ...programme, revision: 3, updatedAt: '2026-09-06T02:00:00Z' }),
    error => error?.code === 'INVALID_REVISION'
  );
});

test('runtime enforces lifecycle transitions on updates', async t => {
  const { runtime } = await fixture(t);
  t.after(() => runtime.close());
  const mission = await json('examples/company-launch/mission.json');
  runtime.putMission(mission);
  runtime.putMission({ ...mission, status: 'completed' });
  assert.throws(
    () => runtime.putMission({ ...mission, status: 'active' }),
    error => error?.code === 'INVALID_TRANSITION'
  );
});
