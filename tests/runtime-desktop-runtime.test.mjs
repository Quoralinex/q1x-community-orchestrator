import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { OpenControlRuntime, RuntimeError } from '../packages/runtime/dist/index.js';

const bridge = resolve('tests/fixtures/desktop-bridge.mjs');

function endpoint(home, overrides = {}) {
  return {
    contractVersion: '1.0.0',
    id: 'desktop.runtime',
    name: 'Portable desktop bridge',
    backend: 'stdio-bridge',
    platform: 'any',
    transport: {
      command: process.execPath,
      args: [bridge],
      timeoutMs: 1000,
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
    { id: 'type', kind: 'type', target: { by: 'role', role: 'textbox', name: 'Name' }, text: secret }
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

test('desktop policy blocks unauthorized applications, unsafe screenshots and incompatible platforms', async t => {
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
    () => runtime.runDesktopBatch('desktop.runtime', batch('desktop.batch.notallowed', [{ id: 'launch', kind: 'launch-application', application: 'other.app' }])),
    error => error instanceof RuntimeError && error.code === 'INSECURE_ENDPOINT'
  );
  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.runtime', batch('desktop.batch.capture', [{ id: 'shot', kind: 'screenshot', outputPath: join(home, 'outside.png') }])),
    error => error instanceof RuntimeError && error.code === 'INSECURE_ENDPOINT'
  );

  const incompatible = process.platform === 'win32' ? 'macos' : 'windows';
  runtime.putDesktopEndpoint(endpoint(home, { id: 'desktop.incompatible', platform: incompatible }));
  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.incompatible', batch('desktop.batch.incompatible', [{ id: 'list', kind: 'list-applications' }])),
    error => error instanceof RuntimeError && error.code === 'TRANSPORT_NOT_FOUND'
  );
});

test('desktop bridge bounds execution and capability discovery', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-bounds-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  process.env.Q1X_TEST_MAPPED = 'mapped-value';
  t.after(() => { delete process.env.Q1X_TEST_MAPPED; });
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.putDesktopEndpoint(endpoint(home));

  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.runtime', { ...batch('desktop.batch.delay', [{ id: 'wait', kind: 'wait', milliseconds: 1 }], { fixtureMode: 'delay' }), timeoutMs: 50 }),
    error => error instanceof RuntimeError && error.code === 'ADAPTER_TRANSPORT_ERROR' && /timed out/i.test(error.message)
  );

  runtime.putDesktopEndpoint(endpoint(home, { id: 'desktop.output', transport: { command: process.execPath, args: [bridge], timeoutMs: 1000, maxOutputBytes: 1024 } }));
  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.output', batch('desktop.batch.output', [{ id: 'list', kind: 'list-applications' }], { fixtureMode: 'overflow' })),
    error => error instanceof RuntimeError && error.code === 'ADAPTER_TRANSPORT_ERROR' && /output limit/i.test(error.message)
  );

  await assert.rejects(
    () => runtime.runDesktopBatch('desktop.runtime', batch('desktop.batch.fail', [{ id: 'list', kind: 'list-applications' }], { fixtureMode: 'fail' })),
    error => error instanceof RuntimeError && error.code === 'ADAPTER_TRANSPORT_ERROR' && /FIXTURE_FAILURE/.test(error.message)
  );

  const capability = runtime.discoverDesktopCapability('desktop.runtime');
  assert.equal(capability.adapterKind, 'desktop-control');
  assert.equal(capability.availability.state, 'available');
  assert.ok(capability.operations.includes('windows'));
  assert.equal(runtime.getCapability(capability.id).id, capability.id);
});
