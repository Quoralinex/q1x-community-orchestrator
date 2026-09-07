import assert from 'node:assert/strict';
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
    const child = spawn(process.execPath, [cli, '--home', home, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

function success(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
test('q1x CLI manages and executes adapter endpoints', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-adapter-cli-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const endpointPath = join(home, 'cli-endpoint.json');
  const requestPath = join(home, 'request.json');
  await writeFile(endpointPath, JSON.stringify({
    contractVersion: '1.0.0', id: 'cli.endpoint', name: 'CLI endpoint',
    adapterKind: 'cli-tui', protocol: 'cli-json-stdio',
    transport: {
      kind: 'stdio', command: process.execPath,
      args: ['-e', 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(s))'],
      inputMode: 'json', outputMode: 'json', timeoutMs: 5000
    }
  }));
  await writeFile(requestPath, JSON.stringify({
    contractVersion: '1.0.0', id: 'exec.cli.endpoint', workItemId: 'work.cli',
    requirements: { operations: ['echo'], adapterKinds: ['cli-tui'] },
    input: { value: 'hello' }, createdAt: '2026-09-07T09:00:00.000Z'
  }));
  assert.equal(success(await run(home, 'adapter-endpoints', 'put', '--file', endpointPath)).id, 'cli.endpoint');
  assert.equal(success(await run(home, 'adapter-endpoints', 'list')).length, 1);
  assert.equal(success(await run(home, 'adapter-endpoints', 'get', 'cli.endpoint')).protocol, 'cli-json-stdio');
  const executed = success(await run(home, 'adapter', 'execute', 'cli.endpoint', '--file', requestPath));
  assert.equal(executed.status, 'succeeded');
  assert.deepEqual(executed.output, { value: 'hello' });
});

test('q1x CLI discovers MCP capabilities through an adapter endpoint', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-adapter-discover-cli-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const endpointPath = join(home, 'mcp-endpoint.json');
  await writeFile(endpointPath, JSON.stringify({
    contractVersion: '1.0.0', id: 'mcp.endpoint', name: 'MCP endpoint',
    adapterKind: 'mcp', protocol: 'mcp-stdio-v2',
    transport: {
      kind: 'stdio', command: process.execPath,
      args: ['tests/fixtures/mcp-stdio-server.mjs'], cwd: root, timeoutMs: 5000
    }
  }));
  success(await run(home, 'adapter-endpoints', 'put', '--file', endpointPath));
  const discovered = success(await run(home, 'adapter', 'discover', 'mcp.endpoint'));
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].operations[0], 'mcp-tool:echo');
  const capabilities = success(await run(home, 'capabilities', 'list'));
  assert.equal(capabilities.length, 1);
});
