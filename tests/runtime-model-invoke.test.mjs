import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

async function module() { return import('../packages/runtime/dist/index.js'); }

function endpoint(port, protocol = 'openai-chat-completions', id = 'endpoint.runtime') {
  return {
    contractVersion: '1.0.0', id, name: id, adapterKind: 'local-inference', protocol,
    url: `http://127.0.0.1:${port}/invoke`, defaultModel: 'test-model', timeoutMs: 2000,
  };
}

function request(endpointId, id = 'model.request.runtime') {
  return {
    contractVersion: '1.0.0', id, endpointId,
    messages: [{ role: 'user', content: 'PROMPT-MUST-NOT-PERSIST-41F2' }],
    maxOutputTokens: 32, createdAt: '2026-09-06T03:00:00Z',
  };
}

test('runtime invokes a stored endpoint without persisting prompt or output', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-model-runtime-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: 'OUTPUT-MUST-NOT-PERSIST-9C77' }, finish_reason: 'stop' }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address(); assert.equal(typeof address, 'object');
  const { OpenControlRuntime } = await module();
  const runtime = OpenControlRuntime.open({ home });
  runtime.putModelEndpoint(endpoint(address.port));
  const response = await runtime.invokeModel(request('endpoint.runtime'));
  assert.equal(response.outputText, 'OUTPUT-MUST-NOT-PERSIST-9C77');
  runtime.close();

  const db = new DatabaseSync(join(home, 'state.sqlite'));
  const documents = db.prepare('SELECT document_json FROM document_versions').all().map(row => row.document_json).join('\n');
  const events = db.prepare('SELECT payload_json FROM runtime_events').all().map(row => row.payload_json).join('\n');
  db.close();
  assert.equal(documents.includes('PROMPT-MUST-NOT-PERSIST-41F2'), false);
  assert.equal(documents.includes('OUTPUT-MUST-NOT-PERSIST-9C77'), false);
  assert.equal(events.includes('PROMPT-MUST-NOT-PERSIST-41F2'), false);
  assert.equal(events.includes('OUTPUT-MUST-NOT-PERSIST-9C77'), false);
});

test('runtime validates endpoint references and model request contracts', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-model-errors-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime, RuntimeError } = await module();
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  await assert.rejects(() => runtime.invokeModel(request('endpoint.missing')), error => {
    assert.equal(error instanceof RuntimeError, true);
    assert.equal(error.code, 'INVALID_REFERENCE');
    return true;
  });
  await assert.rejects(() => runtime.invokeModel({ ...request('endpoint.missing'), messages: [] }), error => {
    assert.equal(error instanceof RuntimeError, true);
    assert.equal(error.code, 'SCHEMA_INVALID');
    return true;
  });
});

test('runtime permits an external in-memory transport', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-model-external-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime } = await module();
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.putModelEndpoint({ ...endpoint(443, 'example-native', 'endpoint.external'), url: 'https://example.invalid/invoke' });
  runtime.registerModelTransport({
    protocol: 'example-native',
    async invoke(ep, req) {
      return { contractVersion: '1.0.0', id: req.id, requestId: req.id, endpointId: ep.id,
        outputText: 'external-ok', startedAt: req.createdAt, finishedAt: req.createdAt };
    },
  });
  const response = await runtime.invokeModel(request('endpoint.external', 'model.request.external'));
  assert.equal(response.outputText, 'external-ok');
});
