import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

async function setup(t) {
  const home = await mkdtemp(join(tmpdir(), 'q1x-runtime-checkpoint-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime } = await import('../packages/runtime/dist/index.js');
  const runtime = OpenControlRuntime.open({ home });
  const mission = await json('examples/company-launch/mission.json');
  const programme = await json('examples/company-launch/programme.json');
  const graph = await json('examples/company-launch/work-graph.json');
  runtime.putMission(mission);
  runtime.putProgramme(programme);
  runtime.putWorkGraph(graph);
  return { home, runtime, OpenControlRuntime, mission, programme, graph };
}

test('programme checkpoint restores scoped heads across restart', async t => {
  const { home, runtime, OpenControlRuntime, programme, graph } = await setup(t);
  const checkpoint = runtime.createCheckpoint(programme.id, 'checkpoint.company.1');
  assert.equal(checkpoint.workGraphRevision, 1);
  assert.equal(runtime.listCheckpoints(programme.id).length, 1);

  const graph2 = {
    ...graph,
    revision: 2,
    updatedAt: '2026-09-06T03:00:00Z',
    nodes: graph.nodes.map(node => node.id === 'task.market-research' ? { ...node, status: 'running' } : node)
  };
  runtime.putWorkGraph(graph2);
  const request = await json('examples/software-delivery/execution-request.json');
  request.id = 'execution.request.after-checkpoint';
  request.workItemId = 'task.market-research';
  runtime.recordExecutionRequest(request);
  assert.equal(runtime.getWorkGraph(graph.id).revision, 2);
  assert.ok(runtime.getExecutionRequest(request.id));

  runtime.restoreCheckpoint(checkpoint.id);
  assert.equal(runtime.getWorkGraph(graph.id).revision, 1);
  assert.equal(runtime.getExecutionRequest(request.id), undefined);
  runtime.close();

  const reopened = OpenControlRuntime.open({ home });
  t.after(() => reopened.close());
  assert.equal(reopened.getWorkGraph(graph.id).revision, 1);
  assert.equal(reopened.getExecutionRequest('execution.request.after-checkpoint'), undefined);
  assert.equal(reopened.listCheckpoints(programme.id).length, 1);
});

test('status reports global and programme-scoped current state', async t => {
  const { runtime, programme } = await setup(t);
  t.after(() => runtime.close());
  runtime.createCheckpoint(programme.id, 'checkpoint.company.status');
  const global = runtime.getStatus();
  assert.equal(global.contractVersion, '1.0.0');
  assert.equal(global.counts.missions, 1);
  assert.equal(global.counts.programmes, 1);
  assert.equal(global.counts.workGraphs, 1);
  assert.equal(global.counts.checkpoints, 1);

  const scoped = runtime.getStatus(programme.id);
  assert.equal(scoped.programmeId, programme.id);
  assert.equal(scoped.counts.missions, 1);
  assert.equal(scoped.counts.programmes, 1);
  assert.equal(scoped.counts.workGraphs, 1);
});
