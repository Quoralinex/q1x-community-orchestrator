import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

async function module() { return import('../packages/runtime/dist/index.js'); }

const cli = resolve('packages/runtime/dist/cli.js');

function run(home, ...args) {
  return spawnSync(process.execPath, [cli, '--home', home, ...args], { encoding: 'utf8' });
}

test('invalid operational ceilings fail closed', async () => {
  const { validateRuntimeLimits, RuntimeError } = await module();
  for (const override of [
    { maxConcurrentAssignments: 0 },
    { childProcessTimeoutMs: 300001 },
    { maxResponseBytes: 1.5 },
    { sqliteBusyTimeoutMs: -1 }
  ]) {
    assert.throws(() => validateRuntimeLimits(override), error =>
      error instanceof RuntimeError && error.code === 'RESOURCE_LIMIT');
  }
});
test('validated limits merge defaults and report weakened overrides', async () => {
  const { DEFAULT_RUNTIME_LIMITS, validateRuntimeLimits } = await module();
  const result = validateRuntimeLimits({ networkTimeoutMs: 45000, maxConcurrentAssignments: 2 });
  assert.equal(result.limits.maxConcurrentAssignments, 2);
  assert.equal(result.limits.networkTimeoutMs, 45000);
  assert.equal(result.limits.maxBrowserSessions, DEFAULT_RUNTIME_LIMITS.maxBrowserSessions);
  assert.deepEqual(result.weakened, ['networkTimeoutMs']);
});

test('retry decisions never retry uncertain non-idempotent dispatch', async () => {
  const { DEFAULT_RUNTIME_LIMITS, retryDecision } = await module();
  assert.equal(retryDecision({ dispatched: true, retrySafe: false, attempt: 1, limits: DEFAULT_RUNTIME_LIMITS }), 'uncertain');
  assert.equal(retryDecision({ dispatched: false, retrySafe: false, attempt: 1, limits: DEFAULT_RUNTIME_LIMITS }), 'retry');
  assert.equal(retryDecision({ dispatched: true, retrySafe: true, attempt: 2, limits: DEFAULT_RUNTIME_LIMITS }), 'retry');
  assert.equal(retryDecision({ dispatched: true, retrySafe: true, attempt: 3, limits: DEFAULT_RUNTIME_LIMITS }), 'stop');
});

test('runtime and CLI expose effective limits without secrets', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-runtime-limits-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime } = await module();
  const runtime = OpenControlRuntime.open({ home, limits: { maxConcurrentAssignments: 3 } });
  assert.equal(runtime.limits.maxConcurrentAssignments, 3);
  assert.deepEqual(runtime.limitWarnings, []);
  runtime.close();

  const result = run(home, 'limits', 'show');
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schema, 'q1x.runtime-limits.v1');
  assert.equal(payload.limits.childProcessTimeoutMs, 30000);
  assert.deepEqual(payload.weakened, []);
});

test('runtime enforces browser session ceilings before opening another backend session', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-browser-limit-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime, RuntimeError } = await module();
  const runtime = OpenControlRuntime.open({ home, limits: { maxBrowserSessions: 1 } });
  t.after(() => runtime.close());
  runtime.registerBrowserBackend({ id: 'limit-fixture', async open() { return { persistent: false, async close() {} }; }, async execute() { throw new Error('not used'); } });
  runtime.putBrowserEndpoint({ contractVersion: '1.0.0', id: 'browser.limit', name: 'Limit browser', backend: 'limit-fixture', mode: 'managed', engine: 'chromium' });
  const first = await runtime.openBrowserSession('browser.limit');
  await assert.rejects(() => runtime.openBrowserSession('browser.limit'), error => error instanceof RuntimeError && error.code === 'RESOURCE_LIMIT');
  await runtime.closeBrowserSession(first.id);
  const second = await runtime.openBrowserSession('browser.limit');
  assert.ok(second.id);
  await runtime.closeBrowserSession(second.id);
});

test('runtime bounds model timeout and rejects oversized responses', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-model-limit-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime, RuntimeError } = await module();
  const runtime = OpenControlRuntime.open({ home, limits: { networkTimeoutMs: 1500, maxResponseBytes: 256 } });
  t.after(() => runtime.close());
  runtime.putModelEndpoint({ contractVersion: '1.0.0', id: 'model.limit', name: 'Limit model', adapterKind: 'local-inference', protocol: 'limit-model', url: 'https://example.invalid/invoke', defaultModel: 'limit-model', timeoutMs: 9000 });
  runtime.registerModelTransport({ protocol: 'limit-model', async invoke(endpoint, request) {
    assert.equal(endpoint.timeoutMs, 1500);
    return { contractVersion: '1.0.0', id: request.id, requestId: request.id, endpointId: endpoint.id, outputText: 'x'.repeat(1000), startedAt: request.createdAt, finishedAt: request.createdAt };
  } });
  await assert.rejects(() => runtime.invokeModel({ contractVersion: '1.0.0', id: 'model.limit.request', endpointId: 'model.limit', messages: [{ role: 'user', content: 'small' }], createdAt: '2026-09-11T00:00:00Z' }), error => error instanceof RuntimeError && error.code === 'RESOURCE_LIMIT');
});

test('runtime bounds adapter child-process timeout before transport dispatch', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-adapter-limit-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime } = await module();
  let seenTimeout;
  const runtime = OpenControlRuntime.open({ home, limits: { childProcessTimeoutMs: 1200 }, adapterTransports: [{ protocol: 'limit-adapter', async execute(endpoint, request) {
    seenTimeout = endpoint.transport.timeoutMs;
    return { contractVersion: '1.0.0', id: 'result.limit', requestId: request.id, workItemId: request.workItemId, status: 'succeeded', output: { ok: true }, startedAt: request.createdAt, finishedAt: request.createdAt };
  } }] });
  t.after(() => runtime.close());
  runtime.putAdapterEndpoint({ contractVersion: '1.0.0', id: 'adapter.limit', name: 'Limit adapter', adapterKind: 'cli-tui', protocol: 'limit-adapter', transport: { kind: 'stdio', command: process.execPath, timeoutMs: 9000, inputMode: 'json', outputMode: 'json' } });
  await runtime.executeAdapter('adapter.limit', { contractVersion: '1.0.0', id: 'adapter.limit.request', workItemId: 'work.limit', requirements: { operations: ['execute'] }, input: {}, createdAt: '2026-09-11T00:00:00Z' });
  assert.equal(seenTimeout, 1200);
});

test('supervision respects runtime concurrency and work-per-cycle ceilings', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-supervision-limit-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime } = await module();
  const runtime = OpenControlRuntime.open({ home, limits: { maxConcurrentAssignments: 1, maxSupervisionWorkPerCycle: 1 } });
  t.after(() => runtime.close());
  const now = '2026-09-11T00:00:00Z';
  runtime.putMission({ contractVersion: '1.0.0', id: 'mission.limit', title: 'Limit mission', objective: 'Bound supervision', status: 'active', outcomes: [{ id: 'outcome.limit', description: 'Done', successCriteria: ['Done'] }], constraints: {}, createdAt: now });
  runtime.putProgramme({ contractVersion: '1.0.0', id: 'programme.limit', missionId: 'mission.limit', revision: 1, status: 'active', workstreams: [{ id: 'ws.limit', title: 'Limit', objective: 'Limit', status: 'active' }], createdAt: now, updatedAt: now });
  runtime.putWorkGraph({ contractVersion: '1.0.0', id: 'graph.limit', programmeId: 'programme.limit', revision: 1,
    nodes: ['a','b'].map(id => ({ id: `task.limit.${id}`, kind: 'task', title: `Task ${id}`, parentId: 'ws.limit', status: 'ready', capabilityRequirements: [{ operation: 'execute', adapterKinds: ['cli-tui'] }] })),
    edges: [], updatedAt: now });
  runtime.putCapability({ contractVersion: '1.0.0', id: 'cap.limit', name: 'Limit capability', adapterKind: 'cli-tui', operations: ['execute'], modalities: { input: ['structured-data'], output: ['structured-data'] }, availability: { state: 'available', checkedAt: now }, cost: { class: 'no-usage-fee' }, privacy: { executionLocation: 'local', dataRetention: 'none' }, trust: { level: 'validated', validatedAt: now }, platforms: ['macos','linux','windows'] });
  runtime.putExecutionBinding({ contractVersion: '1.0.0', id: 'binding.limit', capabilityId: 'cap.limit', executorKind: 'external', operations: ['execute'], enabled: true, priority: 10 });
  let active = 0; let maxActive = 0;
  runtime.registerWorkExecutor('external', { id: 'limit-executor', async execute() { active += 1; maxActive = Math.max(maxActive, active); await new Promise(resolve => setTimeout(resolve, 40)); active -= 1; return { status: 'succeeded' }; } });
  const policy = { contractVersion: '1.0.0', id: 'policy.limit', maxConcurrentAssignments: 4, maxAttemptsPerWorkItem: 1, preferNoUsageFee: true, preferLocal: true, allowUnknownCost: false, stopConditions: ['completed','idle','blocked','approval-required','budget-exhausted'] };
  const cycle = await runtime.runSupervisionCycle('programme.limit', policy);
  assert.equal(cycle.assignmentIds.length, 1);
  assert.equal(maxActive, 1);
  assert.equal(runtime.listWorkAssignments('programme.limit').length, 1);
});
