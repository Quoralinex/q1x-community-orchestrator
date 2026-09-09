import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createA2AAdapterTransport } from '../packages/runtime/dist/a2a-adapter.js';
import { materializeA2AConnector } from '../packages/runtime/dist/connectors/materialize-a2a.js';

const definition = {
  id: 'a2a.jsonrpc', name: 'A2A JSON-RPC Agent', category: 'a2a', protocol: 'a2a-jsonrpc', platforms: ['any'],
  requirements: {}, profile: { kind: 'a2a-jsonrpc' }, compatibility: { status: 'experimental', note: 'fixture' }, provenance: 'first-party',
};

const configuration = (parameters, environmentKeys = {}) => ({
  id: definition.id, enabled: true, profile: definition.profile.kind,
  parameters, environmentKeys, updatedAt: '2026-09-09T00:00:00Z',
});

const execution = endpointId => ({
  contractVersion: '1.0.0', id: 'exec.a2a.profile', workItemId: 'work.a2a.profile',
  requirements: { operations: ['message/send'], adapterKinds: ['a2a'] }, input: { text: 'hello-profile' },
  createdAt: '2026-09-09T00:00:00Z', endpointId,
});

test('A2A profile materializes a validated HTTP endpoint and derives Agent Card URL by default', () => {
  const endpoint = materializeA2AConnector(definition, configuration({ url: 'https://agent.example.test/a2a', timeoutMs: 5000 }));
  assert.equal(endpoint.contractVersion, '1.0.0');
  assert.equal(endpoint.adapterKind, 'a2a');
  assert.equal(endpoint.protocol, 'a2a-jsonrpc');
  assert.equal(endpoint.transport.kind, 'http');
  assert.equal(endpoint.transport.url, 'https://agent.example.test/a2a');
  assert.equal(endpoint.metadata.agentCardUrl, 'https://agent.example.test/.well-known/agent-card.json');
});

test('A2A profile permits explicit secure Agent Card URL and environment credential reference', () => {
  const endpoint = materializeA2AConnector(definition, configuration(
    { url: 'https://agent.example.test/a2a', agentCardUrl: 'https://cards.example.test/card.json' },
    { apiKey: 'A2A_API_KEY' },
  ));
  assert.equal(endpoint.metadata.agentCardUrl, 'https://cards.example.test/card.json');
  assert.deepEqual(endpoint.transport.credentials, [{ header: 'Authorization', environmentKey: 'A2A_API_KEY', prefix: 'Bearer ' }]);
});

test('A2A profile rejects missing endpoint URL and insecure remote endpoint/card URLs', () => {
  assert.throws(() => materializeA2AConnector(definition, configuration({})), /url/i);
  assert.throws(() => materializeA2AConnector(definition, configuration({ url: 'http://agent.example.test/a2a' })), /https|secure|remote/i);
  assert.throws(() => materializeA2AConnector(definition, configuration({
    url: 'https://agent.example.test/a2a', agentCardUrl: 'http://cards.example.test/card.json',
  })), /https|secure|remote|card/i);
});

async function startFixture() {
  let sent;
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url === '/.well-known/agent-card.json') {
      res.end(JSON.stringify({
        protocolVersion: '0.3.0', name: 'Phase12 Agent', description: 'Fixture',
        url: 'http://127.0.0.1/a2a', preferredTransport: 'JSONRPC', capabilities: {},
        defaultInputModes: ['text'], defaultOutputModes: ['text'],
        skills: [{ id: 'echo', name: 'Echo', description: 'Echoes text', tags: ['echo'] }],
      }));
      return;
    }
    let raw = ''; for await (const chunk of req) raw += chunk;
    sent = JSON.parse(raw);
    res.end(JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: {
      kind: 'message', role: 'agent', messageId: 'profile-message', parts: [{ kind: 'text', text: 'a2a-profile-ok' }],
    } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { port: address.port, sent: () => sent, close: () => new Promise(resolve => server.close(resolve)) };
}

test('materialized A2A profile discovers Agent Card skills and executes message/send without source edits', async () => {
  const fixture = await startFixture();
  try {
    const endpoint = materializeA2AConnector(definition, configuration({ url: `http://127.0.0.1:${fixture.port}/a2a`, timeoutMs: 5000 }));
    const transport = createA2AAdapterTransport();
    const capabilities = await transport.discover(endpoint);
    assert.equal(capabilities[0].operations.includes('skill:echo'), true);
    const result = await transport.execute(endpoint, execution(endpoint.id));
    assert.equal(fixture.sent().method, 'message/send');
    assert.equal(result.status, 'succeeded');
    assert.equal(result.output.text, 'a2a-profile-ok');
  } finally {
    await fixture.close();
  }
});

test('materialized A2A profile preserves nonterminal tasks as partial', async () => {
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {
      kind: 'task', id: 'task-profile', contextId: 'ctx-profile', status: { state: 'working' }, artifacts: [],
    } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const endpoint = materializeA2AConnector(definition, configuration({ url: `http://127.0.0.1:${address.port}/a2a` }));
    const result = await createA2AAdapterTransport().execute(endpoint, execution(endpoint.id));
    assert.equal(result.status, 'partial');
    assert.equal(result.output.taskState, 'working');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
