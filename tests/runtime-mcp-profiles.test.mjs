import assert from 'node:assert/strict';
import http from 'node:http';
import process from 'node:process';
import test from 'node:test';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { createMcpAdapterTransports } from '../packages/runtime/dist/mcp-adapter.js';
import { materializeMcpConnector } from '../packages/runtime/dist/connectors/materialize-mcp.js';

const configuration = (id, profile, parameters, environmentKeys = {}) => ({
  id,
  enabled: true,
  profile,
  parameters,
  environmentKeys,
  updatedAt: '2026-09-09T00:00:00Z',
});

const request = endpointId => ({
  contractVersion: '1.0.0', id: `exec.${endpointId}`, workItemId: 'work.mcp.profile',
  requirements: { operations: ['mcp-tool:echo'], adapterKinds: ['mcp'] },
  input: { tool: 'echo', arguments: { text: 'hello-profile' } },
  createdAt: '2026-09-09T00:00:00Z',
});

const stdioDefinition = {
  id: 'mcp.stdio', name: 'MCP stdio', category: 'mcp', protocol: 'mcp-stdio-v2', platforms: ['any'],
  requirements: {}, profile: { kind: 'mcp-stdio' }, compatibility: { status: 'experimental', note: 'fixture' }, provenance: 'first-party',
};

const httpDefinition = {
  id: 'mcp.streamable-http', name: 'MCP Streamable HTTP', category: 'mcp', protocol: 'mcp-streamable-http-v2', platforms: ['any'],
  requirements: {}, profile: { kind: 'mcp-streamable-http' }, compatibility: { status: 'experimental', note: 'fixture' }, provenance: 'first-party',
};

test('MCP stdio profile materializes a direct no-shell adapter endpoint with explicit environment mappings', () => {
  const endpoint = materializeMcpConnector(stdioDefinition, configuration(
    stdioDefinition.id,
    stdioDefinition.profile.kind,
    { command: process.execPath, args: ['tests/fixtures/mcp-stdio-server.mjs'], timeoutMs: 5000, maxOutputBytes: 1048576 },
    { fixtureMode: 'Q1X_MCP_FIXTURE_MODE' },
  ));
  assert.equal(endpoint.contractVersion, '1.0.0');
  assert.equal(endpoint.adapterKind, 'mcp');
  assert.equal(endpoint.protocol, 'mcp-stdio-v2');
  assert.equal(endpoint.transport.kind, 'stdio');
  assert.equal(endpoint.transport.command, process.execPath);
  assert.deepEqual(endpoint.transport.args, ['tests/fixtures/mcp-stdio-server.mjs']);
  assert.deepEqual(endpoint.transport.environment, [{ name: 'fixtureMode', environmentKey: 'Q1X_MCP_FIXTURE_MODE' }]);
});

test('MCP stdio profile rejects missing commands and non-string argv', () => {
  assert.throws(() => materializeMcpConnector(stdioDefinition, configuration(stdioDefinition.id, stdioDefinition.profile.kind, {})), /command/i);
  assert.throws(() => materializeMcpConnector(stdioDefinition, configuration(stdioDefinition.id, stdioDefinition.profile.kind, { command: 'node', args: ['ok', 1] })), /args|argv/i);
});

test('MCP Streamable HTTP profile permits loopback/HTTPS, rejects insecure remote HTTP, and uses environment credentials', () => {
  const endpoint = materializeMcpConnector(httpDefinition, configuration(
    httpDefinition.id,
    httpDefinition.profile.kind,
    { url: 'https://mcp.example.test/mcp', timeoutMs: 5000 },
    { apiKey: 'MCP_API_KEY' },
  ));
  assert.equal(endpoint.transport.kind, 'http');
  assert.deepEqual(endpoint.transport.credentials, [{ header: 'Authorization', environmentKey: 'MCP_API_KEY', prefix: 'Bearer ' }]);
  assert.throws(() => materializeMcpConnector(httpDefinition, configuration(
    httpDefinition.id,
    httpDefinition.profile.kind,
    { url: 'http://mcp.example.test/mcp' },
  )), /https|secure|remote/i);
});

test('materialized MCP stdio profile discovers and executes through the official MCP client path', async () => {
  const endpoint = materializeMcpConnector(stdioDefinition, configuration(
    stdioDefinition.id,
    stdioDefinition.profile.kind,
    { command: process.execPath, args: ['tests/fixtures/mcp-stdio-server.mjs'], cwd: process.cwd(), timeoutMs: 5000 },
  ));
  const transport = createMcpAdapterTransports().find(item => item.protocol === 'mcp-stdio-v2');
  assert.ok(transport);
  const capabilities = await transport.discover(endpoint);
  assert.deepEqual(capabilities.map(item => item.operations[0]), ['mcp-tool:echo']);
  const result = await transport.execute(endpoint, request(endpoint.id));
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.output.structuredContent, { text: 'hello-profile' });
});

async function startHttpFixture() {
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'phase12-mcp-profile', version: '1.0.0' });
    server.registerTool('echo', {
      description: 'Echo profile text', inputSchema: z.object({ text: z.string() }),
    }, async ({ text }) => ({ content: [{ type: 'text', text }], structuredContent: { text } }));
    return server;
  }, { responseMode: 'json' });
  const server = http.createServer(async (incoming, outgoing) => {
    const chunks = []; for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const address = server.address();
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    const method = incoming.method ?? 'GET';
    const request = new Request(`http://127.0.0.1:${address.port}${incoming.url}`, {
      method, headers, body: method === 'GET' || method === 'HEAD' || body.length === 0 ? undefined : body,
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
    close: async () => { await handler.close(); await new Promise(resolve => server.close(resolve)); },
  };
}

test('materialized MCP Streamable HTTP profile discovers and executes a deterministic loopback server', async () => {
  const fixture = await startHttpFixture();
  try {
    const endpoint = materializeMcpConnector(httpDefinition, configuration(
      httpDefinition.id, httpDefinition.profile.kind, { url: fixture.url, timeoutMs: 5000 },
    ));
    const transport = createMcpAdapterTransports().find(item => item.protocol === 'mcp-streamable-http-v2');
    assert.ok(transport);
    const capabilities = await transport.discover(endpoint);
    assert.deepEqual(capabilities.map(item => item.operations[0]), ['mcp-tool:echo']);
    const result = await transport.execute(endpoint, request(endpoint.id));
    assert.equal(result.status, 'succeeded');
    assert.deepEqual(result.output.structuredContent, { text: 'hello-profile' });
  } finally {
    await fixture.close();
  }
});
