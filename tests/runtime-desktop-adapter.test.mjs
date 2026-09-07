import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

async function module() { return import('../packages/runtime/dist/index.js'); }

function request(id, action) {
  return {
    contractVersion: '1.0.0', id, workItemId: 'work.desktop.test',
    requirements: { operations: ['desktop.control'], adapterKinds: ['desktop-control'] },
    input: { action }, createdAt: '2026-09-07T12:00:00Z'
  };
}

function endpoint(id, timeoutMs = 1000) {
  return {
    contractVersion: '1.0.0', id, name: 'Portable desktop bridge',
    adapterKind: 'desktop-control', protocol: 'desktop-json-stdio-v1',
    transport: {
      kind: 'stdio', command: process.execPath,
      args: [resolve('tests/fixtures/desktop-bridge.mjs')],
      inputMode: 'json', outputMode: 'json', timeoutMs, maxOutputBytes: 1024 * 1024
    }
  };
}

test('desktop bridge executes structured application-control requests', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime } = await module();
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.putAdapterEndpoint(endpoint('adapter.desktop.test'));

  const result = await runtime.executeAdapter('adapter.desktop.test', request('request.desktop.focus', 'focusApplication'));
  assert.equal(result.status, 'succeeded');
  assert.equal(result.output.protocol, 'q1x-desktop-bridge/1');
  assert.equal(result.output.requestId, 'request.desktop.focus');
  assert.deepEqual(result.output.input, { action: 'focusApplication' });
});

test('desktop bridge normalizes bridge-declared failures', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-fail-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime } = await module();
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.putAdapterEndpoint(endpoint('adapter.desktop.fail'));

  const result = await runtime.executeAdapter('adapter.desktop.fail', request('request.desktop.fail', 'fail'));
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'DESKTOP_FIXTURE_FAILURE');
});

test('desktop bridge enforces configured timeout', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-timeout-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime } = await module();
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.putAdapterEndpoint(endpoint('adapter.desktop.timeout', 50));

  const result = await runtime.executeAdapter('adapter.desktop.timeout', request('request.desktop.delay', 'delay'));
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'DESKTOP_TIMEOUT');
});
