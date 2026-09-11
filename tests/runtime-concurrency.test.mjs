import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function module() { return import('../packages/runtime/dist/index.js'); }

test('stale competing document revision fails with deterministic conflict', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-concurrency-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { SqliteStore, RuntimeError } = await module();
  const seed = SqliteStore.open(home);
  seed.putDocument({ kind: 'programme', id: 'programme.race', scopeId: 'programme.race', document: { revision: 1, value: 'seed' } });
  seed.close();

  const first = SqliteStore.open(home);
  const second = SqliteStore.open(home);
  t.after(() => { first.close(); second.close(); });
  assert.equal(first.putDocument({
    kind: 'programme', id: 'programme.race', scopeId: 'programme.race',
    document: { revision: 2, value: 'first' }, expectedHeadRevision: 1
  }), 2);
  assert.throws(() => second.putDocument({
    kind: 'programme', id: 'programme.race', scopeId: 'programme.race',
    document: { revision: 2, value: 'second' }, expectedHeadRevision: 1
  }), error => error instanceof RuntimeError && error.code === 'CONFLICT');
});
test('immutable local records are idempotent only for equivalent content', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-idempotent-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { SqliteStore, RuntimeError } = await module();
  const store = SqliteStore.open(home);
  t.after(() => store.close());
  const input = {
    kind: 'execution-result', id: 'result.stable', scopeId: 'programme.stable',
    document: { id: 'result.stable', status: 'succeeded', value: 1 }
  };
  assert.equal(store.putImmutableDocument(input), 1);
  assert.equal(store.putImmutableDocument({ ...input, document: { id: 'result.stable', status: 'succeeded', value: 1 } }), 1);
  assert.equal(store.getHeadRevision('execution-result', 'result.stable'), 1);
  assert.throws(
    () => store.putImmutableDocument({ ...input, document: { id: 'result.stable', status: 'failed', value: 2 } }),
    error => error instanceof RuntimeError && error.code === 'CONFLICT'
  );
});
