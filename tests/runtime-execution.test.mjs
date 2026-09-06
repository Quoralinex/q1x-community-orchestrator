import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

async function setup(t, graphTransform = graph => graph) {
  const home = await mkdtemp(join(tmpdir(), 'q1x-runtime-exec-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime } = await import('../packages/runtime/dist/index.js');
  const runtime = OpenControlRuntime.open({ home });
  runtime.putMission(await json('examples/company-launch/mission.json'));
  runtime.putProgramme(await json('examples/company-launch/programme.json'));
  runtime.putWorkGraph(graphTransform(await json('examples/company-launch/work-graph.json')));
  return { home, runtime, OpenControlRuntime };
}

async function documents() {
  const request = await json('examples/software-delivery/execution-request.json');
  const result = await json('examples/software-delivery/execution-result.json');
  request.id = 'execution.request.company';
  request.workItemId = 'task.market-research';
  result.id = 'execution.result.company';
  result.requestId = request.id;
  result.workItemId = request.workItemId;
  return { request, result };
}

test('execution request and result persist across restart', async t => {
  const { home, runtime, OpenControlRuntime } = await setup(t);
  const { request, result } = await documents();
  runtime.recordExecutionRequest(request);
  runtime.recordExecutionResult(result);
  assert.deepEqual(runtime.getExecutionRequest(request.id), request);
  assert.deepEqual(runtime.getExecutionResult(request.id), result);
  runtime.close();

  const reopened = OpenControlRuntime.open({ home });
  t.after(() => reopened.close());
  assert.deepEqual(reopened.getExecutionRequest(request.id), request);
  assert.deepEqual(reopened.getExecutionResult(request.id), result);
});

test('execution lifecycle rejects unknown, mismatched and duplicate records', async t => {
  const { runtime } = await setup(t);
  t.after(() => runtime.close());
  const { request, result } = await documents();
  assert.throws(
    () => runtime.recordExecutionRequest({ ...request, id: 'unknown', workItemId: 'task.missing' }),
    error => error?.code === 'INVALID_REFERENCE'
  );
  assert.throws(
    () => runtime.recordExecutionResult(result),
    error => error?.code === 'INVALID_REFERENCE'
  );
  runtime.recordExecutionRequest(request);
  assert.throws(
    () => runtime.recordExecutionResult({ ...result, workItemId: 'task.business-model' }),
    error => error?.code === 'EXECUTION_CONFLICT'
  );
  runtime.recordExecutionResult(result);
  assert.throws(
    () => runtime.recordExecutionResult({ ...result, id: 'execution.result.duplicate' }),
    error => error?.code === 'EXECUTION_CONFLICT'
  );
});

test('execution request rejects a terminal work item', async t => {
  const transform = graph => ({
    ...graph,
    nodes: graph.nodes.map(node => node.id === 'task.market-research' ? { ...node, status: 'completed' } : node)
  });
  const { runtime } = await setup(t, transform);
  t.after(() => runtime.close());
  const { request } = await documents();
  assert.throws(
    () => runtime.recordExecutionRequest(request),
    error => error?.code === 'EXECUTION_CONFLICT'
  );
});
