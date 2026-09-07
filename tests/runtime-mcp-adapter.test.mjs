import assert from 'node:assert/strict';
import { test } from 'node:test';
import process from 'node:process';
import http from 'node:http';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  createMcpAdapterTransports
} from '../packages/runtime/dist/index.js';

const endpoint = {
  contractVersion: '1.0.0', id: 'mcp-stdio-test', name: 'MCP stdio test',
  adapterKind: 'mcp', protocol: 'mcp-stdio-v2',
  transport: {
    kind: 'stdio', command: process.execPath,
    args: ['tests/fixtures/mcp-stdio-server.mjs'], cwd: process.cwd(),
    timeoutMs: 5000, maxOutputBytes: 1048576
  }
};

const request = {
  contractVersion: '1.0.0', id: 'exec-mcp-1', workItemId: 'work-1',
  requirements: { operations: ['mcp-tool:echo'], adapterKinds: ['mcp'] },
  input: { tool: 'echo', arguments: { text: 'hello' } },
  createdAt: '2026-09-07T09:00:00.000Z'
};
test('MCP stdio discovers official server tools as Q1X capabilities', async () => {
  const transport = createMcpAdapterTransports().find(item => item.protocol === 'mcp-stdio-v2');
  assert.ok(transport);
  const capabilities = await transport.discover(endpoint);
  assert.equal(capabilities.length, 1);
  assert.equal(capabilities[0].adapterKind, 'mcp');
  assert.deepEqual(capabilities[0].operations, ['mcp-tool:echo']);
  assert.equal(capabilities[0].availability.state, 'available');
});

test('MCP stdio calls an official server tool and normalizes the result', async () => {
  const transport = createMcpAdapterTransports().find(item => item.protocol === 'mcp-stdio-v2');
  assert.ok(transport);
  const result = await transport.execute(endpoint, request);
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.output.structuredContent, { text: 'hello' });
  assert.equal(result.requestId, request.id);
});
async function startHttpMcpServer() {
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'q1x-http-mcp', version: '1.0.0' });
    server.registerTool('echo', {
      description: 'Echo structured text', inputSchema: z.object({ text: z.string() })
    }, async ({ text }) => ({
      content: [{ type: 'text', text }], structuredContent: { text }
    }));
    return server;
  }, { responseMode: 'json' });

  const server = http.createServer(async (incoming, outgoing) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}${incoming.url}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    const method = incoming.method ?? 'GET';
    const request = new Request(url, {
      method, headers,
      body: method === 'GET' || method === 'HEAD' || body.length === 0 ? undefined : body
    });
    const response = await handler.fetch(request);
    outgoing.statusCode = response.status;
    for (const [key, value] of response.headers) outgoing.setHeader(key, value);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: async () => {
      await handler.close();
      await new Promise(resolve => server.close(resolve));
    }
  };
}
test('MCP Streamable HTTP discovers and calls an official loopback server', async () => {
  const fixture = await startHttpMcpServer();
  try {
    const httpEndpoint = {
      contractVersion: '1.0.0', id: 'mcp-http-test', name: 'MCP HTTP test',
      adapterKind: 'mcp', protocol: 'mcp-streamable-http-v2',
      transport: { kind: 'http', url: fixture.url, timeoutMs: 5000 }
    };
    const transport = createMcpAdapterTransports().find(item => item.protocol === 'mcp-streamable-http-v2');
    assert.ok(transport);
    const capabilities = await transport.discover(httpEndpoint);
    assert.deepEqual(capabilities.map(item => item.operations[0]), ['mcp-tool:echo']);
    const result = await transport.execute(httpEndpoint, request);
    assert.equal(result.status, 'succeeded');
    assert.deepEqual(result.output.structuredContent, { text: 'hello' });
  } finally {
    await fixture.close();
  }
});
