import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('sqlite store versions documents and survives restart', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-runtime-store-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { SqliteStore } = await import('../packages/runtime/dist/index.js');

  let store = SqliteStore.open(home);
  const first = { id: 'mission-1', title: 'First' };
  const second = { id: 'mission-1', title: 'Second' };
  assert.equal(store.putDocument({ kind: 'mission', id: 'mission-1', scopeId: null, document: first }), 1);
  assert.equal(store.putDocument({ kind: 'mission', id: 'mission-1', scopeId: null, document: second }), 2);
  assert.equal(store.getHeadRevision('mission', 'mission-1'), 2);
  assert.deepEqual(store.getDocument('mission', 'mission-1'), second);
  assert.deepEqual(store.listDocuments('mission'), [second]);
  store.close();

  store = SqliteStore.open(home);
  assert.equal(store.getHeadRevision('mission', 'mission-1'), 2);
  assert.deepEqual(store.getDocument('mission', 'mission-1'), second);
  store.close();
});
