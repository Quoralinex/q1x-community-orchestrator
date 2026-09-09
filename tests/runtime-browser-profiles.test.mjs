import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chromiumExecutableCandidates,
  detectChromiumExecutable,
  loadBrowserConnectorProfile,
  materializeBrowserConnector,
} from '../packages/runtime/dist/connectors/materialize-browser.js';
import { BrowserSessionManager, createDefaultBrowserBackendRegistry } from '../packages/runtime/dist/index.js';
import { browserExecutable, launchCdpBrowser, startBrowserSite } from './helpers/browser-test-runtime.mjs';

const configuration = (id, profile, parameters) => ({
  id,
  enabled: true,
  profile,
  parameters,
  environmentKeys: {},
  updatedAt: '2026-09-09T00:00:00Z',
});

const definition = (id, profile, protocol) => ({
  id,
  name: id,
  category: 'browser',
  protocol,
  platforms: ['any'],
  requirements: {},
  profile: { kind: profile },
  compatibility: { status: 'experimental', note: 'fixture' },
  provenance: 'first-party',
});

test('browser profiles are closed and protocol-specific', () => {
  const managed = loadBrowserConnectorProfile('browser-managed-chromium');
  const cdp = loadBrowserConnectorProfile('browser-cdp-chromium');
  assert.deepEqual({ mode: managed.mode, engine: managed.engine, backend: managed.backend }, { mode: 'managed', engine: 'chromium', backend: 'playwright' });
  assert.deepEqual({ mode: cdp.mode, engine: cdp.engine, backend: cdp.backend }, { mode: 'cdp', engine: 'chromium', backend: 'playwright' });
  assert.throws(() => loadBrowserConnectorProfile('unknown-browser'), /unknown/i);
});

test('Chromium executable candidates cover supported desktop platforms and explicit override wins', async () => {
  assert.equal(chromiumExecutableCandidates('darwin', {}).some(path => path.includes('Google Chrome.app')), true);
  assert.equal(chromiumExecutableCandidates('win32', { PROGRAMFILES: 'C:\\PF', 'PROGRAMFILES(X86)': 'C:\\PF86', LOCALAPPDATA: 'C:\\Local' }).some(path => path.endsWith('chrome.exe')), true);
  assert.equal(chromiumExecutableCandidates('linux', {}).includes('/usr/bin/google-chrome'), true);
  const executable = await browserExecutable();
  assert.equal(detectChromiumExecutable({ env: { Q1X_BROWSER_EXECUTABLE: executable } }), executable);
});

test('managed Chromium profile auto-detects an installed browser and executes a real page', async t => {
  const executable = await browserExecutable();
  const site = await startBrowserSite(); t.after(() => site.close());
  const def = definition('browser.chromium.managed', 'browser-managed-chromium', 'browser-playwright-managed');
  const endpoint = materializeBrowserConnector(def, configuration(def.id, def.profile.kind, { headless: true, timeoutMs: 60000 }), {
    env: { Q1X_BROWSER_EXECUTABLE: executable },
  });
  assert.equal(endpoint.backend, 'playwright');
  assert.equal(endpoint.mode, 'managed');
  assert.equal(endpoint.engine, 'chromium');
  assert.equal(endpoint.executablePath, executable);
  const manager = new BrowserSessionManager(createDefaultBrowserBackendRegistry()); t.after(() => manager.closeAll());
  const session = await manager.openSession(endpoint);
  const result = await manager.execute(session.id, {
    contractVersion: '1.0.0', id: 'browser.profile.batch', actions: [
      { id: 'nav', kind: 'navigate', url: `${site.baseUrl}/index.html` },
      { id: 'extract', kind: 'extract', target: { by: 'selector', value: 'h1' }, extract: 'text' },
    ],
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.actions.find(item => item.id === 'extract').output, 'Browser Fixture');
});

test('managed browser profile accepts only safe scalar starter settings', async () => {
  const executable = await browserExecutable();
  const def = definition('browser.chromium.managed', 'browser-managed-chromium', 'browser-playwright-managed');
  assert.throws(() => materializeBrowserConnector(def, configuration(def.id, def.profile.kind, { executablePath: 'relative/chrome' })), /absolute|path/i);
  assert.throws(() => materializeBrowserConnector(def, configuration(def.id, def.profile.kind, { headless: 'yes' }), { env: { Q1X_BROWSER_EXECUTABLE: executable } }), /headless/i);
  assert.throws(() => materializeBrowserConnector(def, configuration(def.id, def.profile.kind, { timeoutMs: 0 }), { env: { Q1X_BROWSER_EXECUTABLE: executable } }), /timeout/i);
});

test('CDP Chromium profile materializes loopback control and executes without terminating the external browser', async t => {
  const external = await launchCdpBrowser(); t.after(() => external.close());
  const site = await startBrowserSite(); t.after(() => site.close());
  const def = definition('browser.chromium.cdp', 'browser-cdp-chromium', 'browser-playwright-cdp');
  const endpoint = materializeBrowserConnector(def, configuration(def.id, def.profile.kind, { cdpUrl: external.url, timeoutMs: 30000 }));
  assert.equal(endpoint.mode, 'cdp');
  assert.equal(endpoint.cdpUrl, external.url);
  const manager = new BrowserSessionManager(createDefaultBrowserBackendRegistry());
  const session = await manager.openSession(endpoint);
  const result = await manager.execute(session.id, { contractVersion: '1.0.0', id: 'browser.cdp.profile.batch', actions: [
    { id: 'nav', kind: 'navigate', url: `${site.baseUrl}/index.html` },
    { id: 'extract', kind: 'extract', target: { by: 'selector', value: 'h1' }, extract: 'text' },
  ]});
  assert.equal(result.status, 'succeeded');
  await manager.closeSession(session.id);
  assert.equal(await external.alive(), true);
});

test('CDP browser profile rejects missing and insecure remote control URLs', () => {
  const def = definition('browser.chromium.cdp', 'browser-cdp-chromium', 'browser-playwright-cdp');
  assert.throws(() => materializeBrowserConnector(def, configuration(def.id, def.profile.kind, {})), /cdp/i);
  assert.throws(() => materializeBrowserConnector(def, configuration(def.id, def.profile.kind, { cdpUrl: 'http://browser.example.test:9222' })), /https|wss|remote/i);
});
