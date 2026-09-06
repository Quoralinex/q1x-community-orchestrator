import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const cli = join(root, 'packages/runtime/dist/cli.js');

function run(home, ...args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cli, '--home', home, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('close', code => resolve({ status: code, stdout, stderr }));
  });
}

function success(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('CLI persists endpoints and invokes a loopback model', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-model-cli-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: 'cli-model-ok' } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address(); assert.equal(typeof address, 'object');

  const endpointPath = join(home, 'endpoint.json');
  const requestPath = join(home, 'request.json');
  await writeFile(endpointPath, JSON.stringify({
    contractVersion: '1.0.0', id: 'endpoint.cli', name: 'CLI loopback', adapterKind: 'local-inference',
    protocol: 'openai-chat-completions', url: `http://127.0.0.1:${address.port}/v1/chat`, defaultModel: 'test-model', timeoutMs: 2000,
  }));
  await writeFile(requestPath, JSON.stringify({
    contractVersion: '1.0.0', id: 'model.request.cli', endpointId: 'endpoint.cli',
    messages: [{ role: 'user', content: 'hello' }], createdAt: '2026-09-06T03:30:00Z',
  }));

  assert.equal(success(await run(home, 'endpoints', 'put', '--file', endpointPath)).id, 'endpoint.cli');
  assert.equal(success(await run(home, 'endpoints', 'list')).length, 1);
  assert.equal(success(await run(home, 'endpoints', 'get', 'endpoint.cli')).protocol, 'openai-chat-completions');
  assert.equal(success(await run(home, 'model', 'invoke', '--file', requestPath)).outputText, 'cli-model-ok');
});
