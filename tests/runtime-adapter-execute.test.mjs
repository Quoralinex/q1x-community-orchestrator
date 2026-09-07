import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { OpenControlRuntime } from '../packages/runtime/dist/index.js';

async function withRuntime(fn) {
  const home = await mkdtemp(join(tmpdir(), 'q1x-adapter-runtime-'));
  const runtime = OpenControlRuntime.open({ home });
  try { await fn(runtime); } finally { runtime.close(); await rm(home, { recursive: true, force: true }); }
}

const request = {
  contractVersion: '1.0.0', id: 'exec-adapter-1', workItemId: 'work-1',
  requirements: { operations: ['echo'], adapterKinds: ['cli-tui'] },
  input: { value: 'hello' }, createdAt: '2026-09-07T09:00:00.000Z'
};
test('runtime executes a configured CLI adapter through the default registry', async () => {
  await withRuntime(async runtime => {
    runtime.putAdapterEndpoint({
      contractVersion: '1.0.0', id: 'cli-echo', name: 'CLI echo', adapterKind: 'cli-tui', protocol: 'cli-json-stdio',
      transport: {
        kind: 'stdio', command: process.execPath,
        args: ['-e', 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(s))'],
        inputMode: 'json', outputMode: 'json', timeoutMs: 5000
      }
    });
    const result = await runtime.executeAdapter('cli-echo', request);
    assert.equal(result.status, 'succeeded');
    assert.deepEqual(result.output, request.input);
  });
});
test('runtime discovery persists MCP capabilities into the live registry', async () => {
  await withRuntime(async runtime => {
    runtime.putAdapterEndpoint({
      contractVersion: '1.0.0', id: 'mcp-discovery', name: 'MCP discovery', adapterKind: 'mcp', protocol: 'mcp-stdio-v2',
      transport: {
        kind: 'stdio', command: process.execPath,
        args: ['tests/fixtures/mcp-stdio-server.mjs'], cwd: process.cwd(), timeoutMs: 5000
      }
    });
    const capabilities = await runtime.discoverAdapterCapabilities('mcp-discovery');
    assert.equal(capabilities.length, 1);
    assert.equal(capabilities[0].operations[0], 'mcp-tool:echo');
    assert.equal(runtime.listCapabilities().length, 1);
    assert.equal(runtime.getCapability(capabilities[0].id)?.availability.state, 'available');
  });
});
