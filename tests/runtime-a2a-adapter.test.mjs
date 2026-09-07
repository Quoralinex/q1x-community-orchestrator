import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

async function module() { return import('../packages/runtime/dist/index.js'); }

const execution = input => ({
  contractVersion: '1.0.0', id: 'exec.a2a.1', workItemId: 'work.a2a.1',
  requirements: { operations: ['message/send'], adapterKinds: ['a2a'] }, input,
  createdAt: '2026-09-07T08:30:00Z'
});

function endpoint(port) {
  return {
    contractVersion: '1.0.0', id: 'adapter.a2a.loopback', name: 'Loopback A2A',
    adapterKind: 'a2a', protocol: 'a2a-jsonrpc',
    transport: { kind: 'http', url: `http://127.0.0.1:${port}/a2a`, timeoutMs: 2000 },
    metadata: { agentCardUrl: `http://127.0.0.1:${port}/.well-known/agent-card.json` }
  };
}

test('A2A Agent Card discovery maps skills to capabilities', async t => {
  const server = createServer((req, res) => {
    assert.equal(req.url, '/.well-known/agent-card.json');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ protocolVersion: '0.3.0', name: 'Research Agent', description: 'Researches topics',
      url: 'http://127.0.0.1/a2a', preferredTransport: 'JSONRPC', capabilities: {},
      defaultInputModes: ['text'], defaultOutputModes: ['text'],
      skills: [{ id: 'research', name: 'Research', description: 'Research a topic', tags: ['research'] }] }));
  });  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address(); assert.equal(typeof address, 'object');
  const { createA2AAdapterTransport } = await module();
  const capabilities = await createA2AAdapterTransport().discover(endpoint(address.port));
  assert.equal(capabilities.length, 1);
  assert.equal(capabilities[0].adapterKind, 'a2a');
  assert.equal(capabilities[0].operations.includes('message/send'), true);
  assert.equal(capabilities[0].operations.includes('skill:research'), true);
});

test('A2A message/send normalizes a direct message response', async t => {
  let seen;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    seen = JSON.parse(raw);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: seen.id, result: {
      kind: 'message', role: 'agent', messageId: 'agent-message-1',
      parts: [{ kind: 'text', text: 'agent-ok' }]
    }}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address(); assert.equal(typeof address, 'object');
  const { createA2AAdapterTransport } = await module();
  const result = await createA2AAdapterTransport().execute(endpoint(address.port), execution('hello'));
  assert.equal(seen.method, 'message/send');
  assert.equal(seen.params.message.parts[0].text, 'hello');
  assert.equal(result.status, 'succeeded');
  assert.equal(result.output.text, 'agent-ok');
});
test('A2A working tasks remain partial instead of fabricated success', async t => {
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {
      kind: 'task', id: 'task-1', contextId: 'context-1', status: { state: 'working' }, artifacts: []
    }}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address(); assert.equal(typeof address, 'object');
  const { createA2AAdapterTransport } = await module();
  const result = await createA2AAdapterTransport().execute(endpoint(address.port), execution({ text: 'long work' }));
  assert.equal(result.status, 'partial');
  assert.equal(result.output.taskState, 'working');
});
