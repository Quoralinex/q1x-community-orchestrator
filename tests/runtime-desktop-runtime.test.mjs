import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  OpenControlRuntime,
  RuntimeError,
  assertSafeDesktopBatch,
  desktopPlatformForHost,
  isDesktopPathWithin
} from '../packages/runtime/dist/index.js';

const bridge = resolve('tests/fixtures/desktop-bridge.mjs');

function endpoint(home, overrides = {}) {
  return {
    contractVersion: '1.0.0',
    id: 'desktop.runtime',
    name: 'Portable desktop bridge',
    backend: 'stdio-bridge',
    platform: 'any',
    executionLocation: 'local',
    supportedActions: ['list-applications','launch-application','focus-application','close-application','list-windows','focus-window','move-window','resize-window','inspect','find','click','double-click','hover','type','press','set-value','select','toggle','mouse-move','mouse-down','mouse-up','wheel','drag','wait','screenshot'],
    transport: {
      command: process.execPath,
      args: [bridge],
      timeoutMs: 30000,
      maxOutputBytes: 4096,
      environment: [{ name: 'Q1X_BRIDGE_TEST', environmentKey: 'Q1X_TEST_MAPPED' }]
    },
    applicationPolicy: { allowedApplications: ['example.app'], blockedApplications: ['blocked.app'] },
    outputDir: join(home, 'output'),
    fileAccessRoots: [home],
    ...overrides
  };
}

function batch(id, actions, metadata) {
  return { contractVersion: '1.0.0', id, actions, ...(metadata ? { metadata } : {}) };
}

function unrestrictedEndpoint(home, overrides = {}) {
  const value = endpoint(home, overrides);
  delete value.applicationPolicy;
  return value;
}

test('desktop endpoints persist and execute through an isolated stdio bridge with metadata-only audit', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-runtime-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  process.env.Q1X_TEST_MAPPED = 'mapped-value';
  process.env.Q1X_SHOULD_NOT_INHERIT = 'HOST-SECRET-MUST-NOT-INHERIT';
  t.after(() => { delete process.env.Q1X_TEST_MAPPED; delete process.env.Q1X_SHOULD_NOT_INHERIT; });

  let runtime = OpenControlRuntime.open({ home });
  runtime.putDesktopEndpoint(endpoint(home));
  assert.equal(runtime.getStatus().counts.desktopEndpoints, 1);
  const secret = 'DESKTOP-SECRET-MUST-NOT-PERSIST-7719';
  const result = await runtime.runDesktopBatch('desktop.runtime', batch('desktop.batch.runtime', [
    { id: 'focus', kind: 'focus-application', application: 'example.app' },
    { id: 'type', kind: 'type', application: 'example.app', target: { by: 'role', role: 'textbox', name: 'Name' }, text: secret }
  ]));
  assert.equal(result.status, 'succeeded');
  assert.equal(result.actions[0].output.mappedEnvironment, 'mapped-value');
  assert.equal(result.actions[0].output.inheritedSecret, null);
  assert.equal(result.actions[1].output.text, secret);
  runtime.close();

  const db = new DatabaseSync(join(home, 'state.sqlite'));
  const rows = db.prepare("SELECT event_type,payload_json FROM runtime_events WHERE event_type LIKE 'desktop.%' ORDER BY sequence").all();
  db.close();
  const serialized = JSON.stringify(rows);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes('HOST-SECRET-MUST-NOT-INHERIT'), false);
  assert.match(serialized, /desktop\.execute/);

  runtime = OpenControlRuntime.open({ home });
  assert.equal(runtime.getDesktopEndpoint('desktop.runtime').backend, 'stdio-bridge');
  runtime.close();
});

test('desktop policy rejects unbound or unauthorized actions and audits denied execution', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-policy-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  process.env.Q1X_TEST_MAPPED = 'mapped-value';
  t.after(() => { delete process.env.Q1X_TEST_MAPPED; });
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.putDesktopEndpoint(endpoint(home));

  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.runtime', batch('desktop.batch.blocked', [{ id: 'launch', kind: 'launch-application', application: 'blocked.app' }])),
    error => error instanceof RuntimeError && error.code === 'INSECURE_ENDPOINT'
  );
  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.runtime', batch('desktop.batch.unbound', [{ id: 'press', kind: 'press', key: 'Enter' }])),
    error => error instanceof RuntimeError && error.code === 'INSECURE_ENDPOINT'
  );
  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.runtime', batch('desktop.batch.notallowed', [{ id: 'launch', kind: 'launch-application', application: 'other.app' }])),
    error => error instanceof RuntimeError && error.code === 'INSECURE_ENDPOINT'
  );
  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.runtime', batch('desktop.batch.capture', [{ id: 'shot', kind: 'screenshot', application: 'example.app', outputPath: join(home, 'outside.png') }])),
    error => error instanceof RuntimeError && error.code === 'INSECURE_ENDPOINT'
  );

  const db = new DatabaseSync(join(home, 'state.sqlite'));
  const rows = db.prepare("SELECT payload_json FROM runtime_events WHERE event_type='desktop.execute' ORDER BY sequence").all();
  db.close();
  assert.ok(rows.length >= 4, 'denied desktop executions must be audited');
  assert.match(JSON.stringify(rows), /INSECURE_ENDPOINT/);

  const incompatible = process.platform === 'win32' ? 'macos' : 'windows';
  runtime.putDesktopEndpoint(unrestrictedEndpoint(home, { id: 'desktop.incompatible', platform: incompatible }));
  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.incompatible', batch('desktop.batch.incompatible', [{ id: 'list', kind: 'list-applications' }])),
    error => error instanceof RuntimeError && error.code === 'TRANSPORT_NOT_FOUND'
  );
});

test('desktop platform and path helpers reject unsupported hosts and Windows cross-volume escape', () => {
  assert.equal(desktopPlatformForHost('aix'), undefined);
  assert.equal(isDesktopPathWithin('C:\\safe', 'D:\\escape.png', 'win32'), false);
  assert.equal(isDesktopPathWithin('C:\\safe', 'C:\\safe\\capture.png', 'win32'), true);
  const prepared = assertSafeDesktopBatch({ contractVersion: '1.0.0', id: 'desktop.path', name: 'Path', backend: 'stdio-bridge', platform: 'any', executionLocation: 'local', supportedActions: ['screenshot'], transport: { command: 'bridge' }, outputDir: './desktop-output' }, batch('desktop.batch.path', [{ id: 'shot', kind: 'screenshot', outputPath: './desktop-output/capture.png' }]));
  assert.equal(prepared.actions[0].outputPath, resolve('./desktop-output/capture.png'));
});

test('desktop bridge bounds execution, force-stops stubborn processes and rejects malformed results', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-bounds-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  process.env.Q1X_TEST_MAPPED = 'mapped-value';
  t.after(() => { delete process.env.Q1X_TEST_MAPPED; });
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.putDesktopEndpoint(endpoint(home));

  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.runtime', { ...batch('desktop.batch.delay', [{ id: 'wait', kind: 'wait', application: 'example.app', milliseconds: 1 }], { fixtureMode: 'delay' }), timeoutMs: 50 }),
    error => error instanceof RuntimeError && error.code === 'ADAPTER_TRANSPORT_ERROR' && /timed out/i.test(error.message)
  );

  const stubbornStarted = Date.now();
  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.runtime', { ...batch('desktop.batch.stubborn', [{ id: 'wait', kind: 'wait', application: 'example.app', milliseconds: 1 }], { fixtureMode: 'ignore-term' }), timeoutMs: 50 }),
    error => error instanceof RuntimeError && error.code === 'ADAPTER_TRANSPORT_ERROR' && /timed out/i.test(error.message)
  );
  assert.ok(Date.now() - stubbornStarted < 400, 'timeout must force-stop a bridge that ignores SIGTERM');

  runtime.putDesktopEndpoint(endpoint(home, { id: 'desktop.output', transport: { command: process.execPath, args: [bridge], timeoutMs: 30000, maxOutputBytes: 1024 } }));
  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.output', batch('desktop.batch.output', [{ id: 'list', kind: 'list-applications', application: 'example.app' }], { fixtureMode: 'overflow' })),
    error => error instanceof RuntimeError && error.code === 'ADAPTER_TRANSPORT_ERROR' && /output limit/i.test(error.message)
  );

  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.runtime', batch('desktop.batch.fail', [{ id: 'list', kind: 'list-applications', application: 'example.app' }], { fixtureMode: 'fail' })),
    error => error instanceof RuntimeError && error.code === 'ADAPTER_TRANSPORT_ERROR' && /FIXTURE_FAILURE/.test(error.message)
  );

  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.runtime', batch('desktop.batch.mismatch', [{ id: 'expected', kind: 'list-applications', application: 'example.app' }], { fixtureMode: 'mismatch-actions' })),
    error => error instanceof RuntimeError && error.code === 'ADAPTER_TRANSPORT_ERROR' && /action result/i.test(error.message)
  );
});

test('desktop execution rejects an already-aborted signal before spawning the bridge', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-aborted-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.putDesktopEndpoint(unrestrictedEndpoint(home, {
    id: 'desktop.aborted',
    transport: { command: join(home, 'does-not-exist'), timeoutMs: 1000, maxOutputBytes: 4096 }
  }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.aborted', batch('desktop.batch.aborted', [{ id: 'list', kind: 'list-applications' }]), controller.signal),
    error => error instanceof RuntimeError && error.code === 'ADAPTER_TRANSPORT_ERROR' && /cancelled/i.test(error.message)
  );
});

test('desktop bridge stdin closure is normalized instead of crashing the host', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-stdin-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.putDesktopEndpoint(unrestrictedEndpoint(home, {
    id: 'desktop.stdin',
    transport: { command: process.execPath, args: [bridge, 'exit-early'], timeoutMs: 1000, maxOutputBytes: 4096 }
  }));
  const padding = 'x'.repeat(2 * 1024 * 1024);
  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.stdin', batch('desktop.batch.stdin', [{ id: 'list', kind: 'list-applications' }], { padding })),
    error => error instanceof RuntimeError && error.code === 'ADAPTER_TRANSPORT_ERROR'
  );
});

test('desktop discovery namespaces capabilities and preserves configured execution location', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-discovery-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.putDesktopEndpoint(unrestrictedEndpoint(home, { executionLocation: 'private-network' }));

  const capability = runtime.discoverDesktopCapability('desktop.runtime');
  assert.equal(capability.id, 'capability.desktop.desktop.runtime');
  assert.equal(capability.adapterKind, 'desktop-control');
  assert.equal(capability.availability.state, 'available');
  assert.equal(capability.privacy.executionLocation, 'private-network');
  assert.ok(capability.operations.includes('focus-window'));
  assert.deepEqual(capability.operations, runtime.getDesktopEndpoint('desktop.runtime').supportedActions);
  assert.equal(runtime.getCapability(capability.id).id, capability.id);
});

test('custom desktop backends can persist and execute without stdio transport configuration', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-native-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.registerDesktopBackend({
    id: 'native-test',
    async execute(_endpoint, request) {
      return {
        contractVersion: '1.0.0', id: `${request.id}.result`, batchId: request.id, status: 'succeeded',
        actions: request.actions.map(action => ({ id: action.id, status: 'succeeded', durationMs: 0 }))
      };
    }
  });
  runtime.putDesktopEndpoint({
    contractVersion: '1.0.0', id: 'desktop.native', name: 'Native test backend', backend: 'native-test',
    platform: 'windows', executionLocation: 'private-network', supportedActions: ['list-applications'], backendConfig: { channel: 'accessibility' }
  });
  const result = await runtime.runDesktopBatch('desktop.native', batch('desktop.batch.native', [{ id: 'list', kind: 'list-applications' }]));
  assert.equal(result.status, 'succeeded');
  const capability = runtime.discoverDesktopCapability('desktop.native');
  assert.deepEqual(capability.operations, ['list-applications']);
  assert.equal(capability.availability.state, 'available');
});
