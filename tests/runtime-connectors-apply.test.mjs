import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { OpenControlRuntime } from '../packages/runtime/dist/runtime.js';
import { configureConnector } from '../packages/runtime/dist/connectors/configuration.js';
import { applyConfiguredConnector } from '../packages/runtime/dist/connectors/apply.js';
import { browserExecutable } from './helpers/browser-test-runtime.mjs';

function config(home, id, profile, parameters = {}, environmentKeys = {}, enabled = true) {
  return configureConnector(home, { id, profile, parameters, environmentKeys, enabled });
}

function healthyPreflight() {
  return {
    commandExists: async () => true,
    desktopDoctor: async platform => ({ platform, state: 'ok', checks: [] }),
  };
}

test('apply persists configured model, MCP, A2A and CLI connectors into existing endpoint stores', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-connector-apply-adapters-'));
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => { runtime.close(); return rm(home, { recursive: true, force: true }); });

  config(home, 'model.openai-chat.local', 'model-openai-chat-local', {
    url: 'http://127.0.0.1:1234/v1/chat/completions', model: 'local-model',
  });
  const model = await applyConfiguredConnector(runtime, 'model.openai-chat.local', { preflight: healthyPreflight() });
  assert.equal(model.category, 'model');
  assert.equal(runtime.getModelEndpoint(model.endpointId).protocol, 'openai-chat-completions');

  config(home, 'mcp.stdio', 'mcp-stdio', { command: process.execPath, args: ['tests/fixtures/mcp-stdio-server.mjs'] });
  const mcp = await applyConfiguredConnector(runtime, 'mcp.stdio', { preflight: healthyPreflight() });
  assert.equal(runtime.getAdapterEndpoint(mcp.endpointId).adapterKind, 'mcp');

  config(home, 'a2a.jsonrpc', 'a2a-jsonrpc', { url: 'http://127.0.0.1:9999/a2a' });
  const a2a = await applyConfiguredConnector(runtime, 'a2a.jsonrpc', { preflight: healthyPreflight() });
  assert.equal(runtime.getAdapterEndpoint(a2a.endpointId).adapterKind, 'a2a');

  config(home, 'cli.json', 'cli-json-stdio', { command: process.execPath, args: ['-e', 'console.log("{}")'] });
  const cli = await applyConfiguredConnector(runtime, 'cli.json', { preflight: healthyPreflight() });
  assert.equal(runtime.getAdapterEndpoint(cli.endpointId).adapterKind, 'cli-tui');
});

test('apply persists managed browser into the existing browser endpoint store', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-connector-apply-browser-'));
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => { runtime.close(); return rm(home, { recursive: true, force: true }); });
  const executable = await browserExecutable();
  config(home, 'browser.chromium.managed', 'browser-managed-chromium', { headless: true });
  const applied = await applyConfiguredConnector(runtime, 'browser.chromium.managed', {
    preflight: healthyPreflight(), browser: { env: { Q1X_BROWSER_EXECUTABLE: executable } },
  });
  const endpoint = runtime.getBrowserEndpoint(applied.endpointId);
  assert.equal(endpoint.mode, 'managed');
  assert.equal(endpoint.executablePath, executable);
});

test('apply persists only the current first-party desktop connector into the existing desktop endpoint store', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-connector-apply-desktop-'));
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => { runtime.close(); return rm(home, { recursive: true, force: true }); });
  const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
  const id = `desktop.${platform}.first-party`;
  config(home, id, 'desktop-first-party', { outputDir: join(home, 'desktop-output') });
  const applied = await applyConfiguredConnector(runtime, id, {
    preflight: { ...healthyPreflight(), platform: process.platform },
  });
  const endpoint = runtime.getDesktopEndpoint(applied.endpointId);
  assert.equal(endpoint.platform, platform);
  assert.equal(endpoint.outputDir, join(home, 'desktop-output'));
});

test('apply refuses disabled connectors and blocked or unsupported preflight', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-connector-apply-gates-'));
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => { runtime.close(); return rm(home, { recursive: true, force: true }); });
  config(home, 'model.openai-chat.local', 'model-openai-chat-local', {
    url: 'http://127.0.0.1:1234/v1/chat/completions', model: 'local-model',
  }, {}, false);
  await assert.rejects(() => applyConfiguredConnector(runtime, 'model.openai-chat.local', { preflight: healthyPreflight() }), /enabled|disabled/i);

  config(home, 'model.openai-chat.local', 'model-openai-chat-local', {
    url: 'http://127.0.0.1:1234/v1/chat/completions', model: 'local-model',
  });
  await assert.rejects(() => applyConfiguredConnector(runtime, 'model.openai-chat.local', {
    preflight: { ...healthyPreflight(), platform: 'freebsd' },
  }), /unsupported|preflight/i);
});
