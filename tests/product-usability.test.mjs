import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const cli = join(root, 'packages/runtime/dist/cli.js');

function runCli(home, ...args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cli, '--home', home, ...args], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('close', status => resolve({ status, stdout, stderr }));
  });
}

function success(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function startFixture(relativePath) {
  const child = spawn(process.execPath, [relativePath], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const metadata = await new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error(`Fixture ${relativePath} did not announce readiness: ${stderr}`)), 5000);
    child.stdout.on('data', chunk => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(buffer.slice(0, newline)));
      } catch (error) {
        reject(new Error(`Fixture ${relativePath} emitted invalid startup metadata: ${error.message}`));
      }
    });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Fixture ${relativePath} exited before readiness with ${code}: ${stderr}`));
    });
  });
  return {
    child,
    metadata,
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    },
  };
}

test('product user configures and invokes a local model through connector CLI without endpoint JSON', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-product-model-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const fixture = await startFixture('tests/fixtures/product-usability/model-server.mjs');
  t.after(() => fixture.close());

  const listed = success(await runCli(home, 'connectors', 'list'));
  assert.ok(listed.some(connector => connector.id === 'model.openai-chat.local'));

  success(await runCli(home, 'connectors', 'add', 'model.openai-chat.local'));
  success(await runCli(
    home,
    'connectors', 'configure', 'model.openai-chat.local',
    '--parameter', `url=${fixture.metadata.chatUrl}`,
    '--parameter', 'model=phase12-fixture',
  ));
  success(await runCli(home, 'connectors', 'enable', 'model.openai-chat.local'));
  const preflight = success(await runCli(home, 'connectors', 'test', 'model.openai-chat.local'));
  assert.notEqual(preflight.state, 'blocked');
  const applied = success(await runCli(home, 'connectors', 'apply', 'model.openai-chat.local'));
  assert.equal(applied.endpointId, 'endpoint.model.openai-chat.local');

  const requestPath = join(home, 'model-request.json');
  await writeFile(requestPath, JSON.stringify({
    contractVersion: '1.0.0',
    id: 'model.request.phase12.product',
    endpointId: applied.endpointId,
    messages: [{ role: 'user', content: 'phase12-product-model' }],
    createdAt: '2026-09-09T17:30:00.000Z',
  }));
  const response = success(await runCli(home, 'model', 'invoke', '--file', requestPath));
  assert.equal(response.outputText, 'phase12-product-model-ok');
});

test('product user configures, discovers and invokes MCP stdio through connector CLI without endpoint JSON', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-product-mcp-'));
  t.after(() => rm(home, { recursive: true, force: true }));

  success(await runCli(home, 'connectors', 'add', 'mcp.stdio'));
  success(await runCli(
    home,
    'connectors', 'configure', 'mcp.stdio',
    '--parameter', `command=${process.execPath}`,
    '--parameter', `args=${JSON.stringify(['tests/fixtures/product-usability/mcp-server.mjs'])}`,
    '--parameter', `cwd=${root}`,
    '--parameter', 'timeoutMs=5000',
  ));
  success(await runCli(home, 'connectors', 'enable', 'mcp.stdio'));
  const preflight = success(await runCli(home, 'connectors', 'test', 'mcp.stdio'));
  assert.notEqual(preflight.state, 'blocked');
  const applied = success(await runCli(home, 'connectors', 'apply', 'mcp.stdio'));
  assert.equal(applied.endpointId, 'adapter.mcp.stdio');

  const discovered = success(await runCli(home, 'adapter', 'discover', applied.endpointId));
  assert.equal(discovered.some(capability => capability.operations.includes('mcp-tool:echo')), true);

  const requestPath = join(home, 'mcp-request.json');
  await writeFile(requestPath, JSON.stringify({
    contractVersion: '1.0.0',
    id: 'exec.mcp.phase12.product',
    workItemId: 'work.mcp.phase12.product',
    requirements: { operations: ['mcp-tool:echo'], adapterKinds: ['mcp'] },
    input: { tool: 'echo', arguments: { text: 'phase12-product-mcp' } },
    createdAt: '2026-09-09T17:31:00.000Z',
  }));
  const executed = success(await runCli(home, 'adapter', 'execute', applied.endpointId, '--file', requestPath));
  assert.equal(executed.status, 'succeeded');
  assert.deepEqual(executed.output.structuredContent, { text: 'phase12-product-mcp' });
});

test('product user configures, discovers and invokes A2A JSON-RPC through connector CLI without endpoint JSON', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-product-a2a-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const fixture = await startFixture('tests/fixtures/product-usability/a2a-server.mjs');
  t.after(() => fixture.close());

  success(await runCli(home, 'connectors', 'add', 'a2a.jsonrpc'));
  success(await runCli(
    home,
    'connectors', 'configure', 'a2a.jsonrpc',
    '--parameter', `url=${fixture.metadata.a2aUrl}`,
    '--parameter', 'timeoutMs=5000',
  ));
  success(await runCli(home, 'connectors', 'enable', 'a2a.jsonrpc'));
  const preflight = success(await runCli(home, 'connectors', 'test', 'a2a.jsonrpc'));
  assert.notEqual(preflight.state, 'blocked');
  const applied = success(await runCli(home, 'connectors', 'apply', 'a2a.jsonrpc'));
  assert.equal(applied.endpointId, 'adapter.a2a.jsonrpc');

  const discovered = success(await runCli(home, 'adapter', 'discover', applied.endpointId));
  assert.equal(discovered.some(capability => capability.operations.includes('skill:echo')), true);

  const requestPath = join(home, 'a2a-request.json');
  await writeFile(requestPath, JSON.stringify({
    contractVersion: '1.0.0',
    id: 'exec.a2a.phase12.product',
    workItemId: 'work.a2a.phase12.product',
    requirements: { operations: ['message/send'], adapterKinds: ['a2a'] },
    input: { text: 'phase12-product-a2a' },
    createdAt: '2026-09-09T17:32:00.000Z',
  }));
  const executed = success(await runCli(home, 'adapter', 'execute', applied.endpointId, '--file', requestPath));
  assert.equal(executed.status, 'succeeded');
  assert.equal(executed.output.text, 'phase12-product-a2a-ok');
});

test('product user configures and invokes JSON and text CLI tools through connector CLI without endpoint JSON', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-product-cli-'));
  t.after(() => rm(home, { recursive: true, force: true }));

  for (const connectorId of ['cli.json', 'cli.text']) {
    success(await runCli(home, 'connectors', 'add', connectorId));
    success(await runCli(
      home,
      'connectors', 'configure', connectorId,
      '--parameter', `command=${process.execPath}`,
      '--parameter', `args=${JSON.stringify(['tests/fixtures/product-usability/cli-tool.mjs', connectorId === 'cli.json' ? 'json' : 'text'])}`,
      '--parameter', `cwd=${root}`,
      '--parameter', 'timeoutMs=5000',
    ));
    success(await runCli(home, 'connectors', 'enable', connectorId));
    const preflight = success(await runCli(home, 'connectors', 'test', connectorId));
    assert.notEqual(preflight.state, 'blocked');
    success(await runCli(home, 'connectors', 'apply', connectorId));
  }

  const jsonRequestPath = join(home, 'cli-json-request.json');
  await writeFile(jsonRequestPath, JSON.stringify({
    contractVersion: '1.0.0',
    id: 'exec.cli.json.phase12.product',
    workItemId: 'work.cli.json.phase12.product',
    requirements: { operations: ['execute'], adapterKinds: ['cli-tui'] },
    input: { text: 'phase12-product-cli-json' },
    createdAt: '2026-09-09T17:33:00.000Z',
  }));
  const jsonExecuted = success(await runCli(home, 'adapter', 'execute', 'adapter.cli.json', '--file', jsonRequestPath));
  assert.equal(jsonExecuted.status, 'succeeded');
  assert.deepEqual(jsonExecuted.output, { text: 'phase12-product-cli-json', mode: 'json' });

  const textRequestPath = join(home, 'cli-text-request.json');
  await writeFile(textRequestPath, JSON.stringify({
    contractVersion: '1.0.0',
    id: 'exec.cli.text.phase12.product',
    workItemId: 'work.cli.text.phase12.product',
    requirements: { operations: ['execute'], adapterKinds: ['cli-tui'] },
    input: 'phase12-product-cli-text; no-shell',
    createdAt: '2026-09-09T17:34:00.000Z',
  }));
  const textExecuted = success(await runCli(home, 'adapter', 'execute', 'adapter.cli.text', '--file', textRequestPath));
  assert.equal(textExecuted.status, 'succeeded');
  assert.equal(textExecuted.output, 'phase12-product-cli-text; no-shell|mode=text');
});

test('product user configures and controls a managed Chromium browser through connector CLI without endpoint JSON', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-product-browser-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const fixture = await startFixture('tests/fixtures/product-usability/web-server.mjs');
  t.after(() => fixture.close());

  success(await runCli(home, 'connectors', 'add', 'browser.chromium.managed'));
  success(await runCli(
    home,
    'connectors', 'configure', 'browser.chromium.managed',
    '--parameter', 'headless=true',
    '--parameter', 'timeoutMs=60000',
  ));
  success(await runCli(home, 'connectors', 'enable', 'browser.chromium.managed'));
  const preflight = success(await runCli(home, 'connectors', 'test', 'browser.chromium.managed'));
  assert.notEqual(preflight.state, 'blocked');
  const applied = success(await runCli(home, 'connectors', 'apply', 'browser.chromium.managed'));
  assert.equal(applied.category, 'browser');

  const batchPath = join(home, 'browser-batch.json');
  await writeFile(batchPath, JSON.stringify({
    contractVersion: '1.0.0',
    id: 'browser.batch.phase12.product',
    actions: [
      { id: 'nav', kind: 'navigate', url: `${fixture.metadata.baseUrl}/index.html` },
      { id: 'extract', kind: 'extract', target: { by: 'selector', value: 'h1' }, extract: 'text' },
    ],
  }));
  const result = success(await runCli(home, 'browser', 'run', applied.endpointId, '--file', batchPath));
  assert.equal(result.status, 'succeeded');
  assert.equal(result.actions.find(action => action.id === 'extract').output, 'Phase 12 Product Browser');
});
