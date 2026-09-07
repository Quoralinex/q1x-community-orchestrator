import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { OpenControlRuntime, RuntimeError } from '../packages/runtime/dist/index.js';

const managed = home => ({
  contractVersion: '1.0.0', id: 'browser.managed', name: 'Managed Chromium',
  backend: 'playwright', mode: 'managed', engine: 'chromium', headless: true,
  downloadDir: join(home, 'downloads'), fileAccessRoots: [home], timeoutMs: 30000
});

test('browser endpoints persist without creating browser sessions', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-browser-endpoint-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  let runtime = OpenControlRuntime.open({ home });
  const endpoint = runtime.putBrowserEndpoint(managed(home));
  assert.equal(endpoint.id, 'browser.managed');
  assert.equal(runtime.listBrowserEndpoints().length, 1);
  assert.equal(runtime.getStatus().counts.browserEndpoints, 1);
  runtime.close();
  runtime = OpenControlRuntime.open({ home });
  assert.equal(runtime.getBrowserEndpoint('browser.managed').engine, 'chromium');
  assert.equal(runtime.listBrowserEndpoints().length, 1);
  runtime.close();
});

test('browser endpoint security rejects unsafe CDP and path configuration', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-browser-security-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  const expectInsecure = value => assert.throws(
    () => runtime.putBrowserEndpoint(value),
    error => error instanceof RuntimeError && error.code === 'INSECURE_ENDPOINT'
  );
  expectInsecure({ contractVersion:'1.0.0', id:'browser.remote-http', name:'Bad', backend:'playwright', mode:'cdp', cdpUrl:'http://example.com:9222' });
  expectInsecure({ contractVersion:'1.0.0', id:'browser.remote-ws', name:'Bad', backend:'playwright', mode:'cdp', cdpUrl:'ws://example.com/devtools/browser/id' });
  expectInsecure({ contractVersion:'1.0.0', id:'browser.creds', name:'Bad', backend:'playwright', mode:'cdp', cdpUrl:'https://user:secret@example.com/cdp' });
  expectInsecure({ ...managed(home), id:'browser.relative-download', downloadDir:'./downloads' });
  expectInsecure({ ...managed(home), id:'browser.relative-root', fileAccessRoots:['uploads'] });
});

test('browser endpoint security permits loopback CDP and secure remote CDP', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-browser-cdp-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  assert.equal(runtime.putBrowserEndpoint({ contractVersion:'1.0.0', id:'browser.local-cdp', name:'Local', backend:'playwright', mode:'cdp', cdpUrl:'http://127.0.0.1:9222' }).id, 'browser.local-cdp');
  assert.equal(runtime.putBrowserEndpoint({ contractVersion:'1.0.0', id:'browser.remote-cdp', name:'Remote', backend:'playwright', mode:'cdp', cdpUrl:'wss://browser.example.com/devtools/browser/id' }).id, 'browser.remote-cdp');
});
