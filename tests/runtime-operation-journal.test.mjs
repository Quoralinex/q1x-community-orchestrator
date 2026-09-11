import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

async function module() { return import('../packages/runtime/dist/index.js'); }
async function tempHome(t) {
  const home = await mkdtemp(join(tmpdir(), 'q1x-operation-journal-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

test('dispatched operation without durable result becomes uncertain after restart', async t => {
  const home = await tempHome(t);
  const { OpenControlRuntime } = await module();
  let runtime = OpenControlRuntime.open({ home });
  const operation = runtime.beginExternalOperation({ kind: 'adapter', subjectId: 'adapter.example', retrySafe: false });
  assert.equal(operation.state, 'intent-recorded');
  runtime.markExternalOperationDispatched(operation.id);
  runtime.close();

  runtime = OpenControlRuntime.open({ home });
  const reconciled = runtime.reconcileExternalOperations();
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].state, 'interrupted-uncertain');
  assert.equal(runtime.getExternalOperation(operation.id).state, 'interrupted-uncertain');
  runtime.close();
});

test('intent remains retryable only before dispatch and completed work cannot be reopened', async t => {
  const home = await tempHome(t);
  const { OpenControlRuntime, RuntimeError } = await module();
  const runtime = OpenControlRuntime.open({ home });
  const intent = runtime.beginExternalOperation({ id: 'operation.intent', kind: 'adapter', subjectId: 'adapter.intent', retrySafe: false });
  assert.equal(runtime.reconcileExternalOperations().length, 0);
  assert.equal(runtime.getExternalOperation(intent.id).state, 'intent-recorded');

  const completed = runtime.beginExternalOperation({ id: 'operation.completed', kind: 'model', subjectId: 'model.request.1', retrySafe: false });
  runtime.markExternalOperationDispatched(completed.id);
  runtime.completeExternalOperation(completed.id, { state: 'completed', resultRef: 'response.1' });
  assert.equal(runtime.getExternalOperation(completed.id).state, 'completed');
  assert.throws(
    () => runtime.beginExternalOperation({ id: completed.id, kind: 'model', subjectId: 'model.request.1', retrySafe: false }),
    error => error instanceof RuntimeError && error.code === 'EXECUTION_CONFLICT'
  );
  runtime.close();
});
test('model dispatch is journalled without persisting prompt or output content', async t => {
  const home = await tempHome(t);
  const { OpenControlRuntime } = await module();
  const runtime = OpenControlRuntime.open({ home });
  runtime.putModelEndpoint({
    contractVersion: '1.0.0', id: 'model.journal', name: 'Journal model', adapterKind: 'local-inference',
    protocol: 'journal-test', url: 'https://example.invalid/invoke', defaultModel: 'test-model'
  });
  runtime.registerModelTransport({
    protocol: 'journal-test',
    async invoke(endpoint, request) {
      return {
        contractVersion: '1.0.0', id: 'response.journal', requestId: request.id, endpointId: endpoint.id,
        outputText: 'OUTPUT-MUST-NOT-PERSIST-1A2B', startedAt: request.createdAt, finishedAt: request.createdAt
      };
    }
  });
  await runtime.invokeModel({
    contractVersion: '1.0.0', id: 'request.journal', endpointId: 'model.journal',
    messages: [{ role: 'user', content: 'PROMPT-MUST-NOT-PERSIST-3C4D' }], createdAt: '2026-09-11T00:00:00Z'
  });
  runtime.close();
  const db = new DatabaseSync(join(home, 'state.sqlite'));
  const rows = db.prepare('SELECT kind, subject_id, state, metadata_json FROM external_operations ORDER BY created_at, id').all();
  db.close();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'model');
  assert.equal(rows[0].subject_id, 'request.journal');
  assert.equal(rows[0].state, 'completed');
  const serialized = JSON.stringify(rows);
  assert.equal(serialized.includes('PROMPT-MUST-NOT-PERSIST-3C4D'), false);
  assert.equal(serialized.includes('OUTPUT-MUST-NOT-PERSIST-1A2B'), false);
});

test('failed dispatch records only bounded failure metadata', async t => {
  const home = await tempHome(t);
  const { OpenControlRuntime, RuntimeError } = await module();
  const runtime = OpenControlRuntime.open({ home });
  runtime.putModelEndpoint({
    contractVersion: '1.0.0', id: 'model.failure', name: 'Failure model', adapterKind: 'local-inference',
    protocol: 'journal-failure', url: 'https://example.invalid/invoke', defaultModel: 'test-model'
  });
  runtime.registerModelTransport({ protocol: 'journal-failure', async invoke() { throw new RuntimeError('MODEL_TRANSPORT_ERROR', 'SECRET-FAILURE-TEXT'); } });
  await assert.rejects(() => runtime.invokeModel({
    contractVersion: '1.0.0', id: 'request.failure', endpointId: 'model.failure',
    messages: [{ role: 'user', content: 'SECRET-PROMPT-MUST-NOT-PERSIST' }], createdAt: '2026-09-11T00:00:00Z'
  }));
  const entry = runtime.listExternalOperations().find(item => item.subjectId === 'request.failure');
  assert.equal(entry.state, 'failed');
  assert.equal(entry.metadata.errorCode, 'MODEL_TRANSPORT_ERROR');
  assert.equal(JSON.stringify(entry).includes('SECRET-FAILURE-TEXT'), false);
  assert.equal(JSON.stringify(entry).includes('SECRET-PROMPT-MUST-NOT-PERSIST'), false);
  runtime.close();
});
