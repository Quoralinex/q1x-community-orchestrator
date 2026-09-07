import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  BrowserSessionManager,
  createDefaultBrowserBackendRegistry,
  RuntimeError
} from '../packages/runtime/dist/index.js';
import { browserExecutable, launchCdpBrowser } from './helpers/browser-test-runtime.mjs';

function endpoint(executablePath) {
  return {
    contractVersion: '1.0.0', id: 'browser.session-test', name: 'Managed browser',
    backend: 'playwright', mode: 'managed', engine: 'chromium', headless: true,
    executablePath, timeoutMs: 60000
  };
}

test('managed browser sessions are distinct and close cleanly', async t => {
  const executablePath = await browserExecutable();
  const manager = new BrowserSessionManager(createDefaultBrowserBackendRegistry());
  t.after(async () => manager.closeAll());
  const first = await manager.openSession(endpoint(executablePath));
  const second = await manager.openSession({ ...endpoint(executablePath), id: 'browser.session-test-2' });
  assert.notEqual(first.id, second.id);
  assert.equal(manager.count(), 2);
  assert.equal(manager.getSession(first.id)?.endpointId, 'browser.session-test');
  await manager.closeSession(first.id);
  assert.equal(manager.count(), 1);
  assert.equal(manager.getSession(first.id), undefined);
  await assert.rejects(() => manager.closeSession(first.id), error => error instanceof RuntimeError && error.code === 'NOT_FOUND');
});

test('managed browser session does not write profile state unless userDataDir is explicit', async t => {
  const executablePath = await browserExecutable();
  const home = await mkdtemp(join(tmpdir(), 'q1x-browser-session-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const manager = new BrowserSessionManager(createDefaultBrowserBackendRegistry());
  t.after(async () => manager.closeAll());
  const handle = await manager.openSession(endpoint(executablePath));
  assert.equal(handle.persistent, false);
});


test('CDP session disconnects without terminating the existing browser', async t => {
  const external = await launchCdpBrowser();
  t.after(() => external.close());
  const manager = new BrowserSessionManager(createDefaultBrowserBackendRegistry());
  t.after(async () => manager.closeAll());
  const handle = await manager.openSession({
    contractVersion: '1.0.0', id: 'browser.cdp-test', name: 'Existing browser',
    backend: 'playwright', mode: 'cdp', cdpUrl: external.url, timeoutMs: 30000
  });
  assert.equal(handle.persistent, true);
  await manager.closeSession(handle.id);
  assert.equal(await external.alive(), true);
});
