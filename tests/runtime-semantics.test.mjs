import assert from 'node:assert/strict';
import test from 'node:test';

const baseGraph = {
  contractVersion: '1.0.0', id: 'graph-1', programmeId: 'programme-1', revision: 1,
  nodes: [
    { id: 'a', kind: 'task', title: 'A', status: 'ready' },
    { id: 'b', kind: 'task', title: 'B', status: 'pending' }
  ],
  edges: [], updatedAt: '2026-09-06T00:00:00Z'
};

test('semantic graph validation rejects broken references and dependency cycles', async () => {
  const { validateGraphStructure } = await import('../packages/runtime/dist/index.js');
  assert.doesNotThrow(() => validateGraphStructure(baseGraph));
  assert.throws(
    () => validateGraphStructure({ ...baseGraph, nodes: [{ ...baseGraph.nodes[0], parentId: 'missing' }, baseGraph.nodes[1]] }),
    error => error?.code === 'INVALID_REFERENCE'
  );
  assert.throws(
    () => validateGraphStructure({ ...baseGraph, edges: [{ from: 'a', to: 'missing', type: 'depends-on' }] }),
    error => error?.code === 'INVALID_REFERENCE'
  );
});

test('dependency graph must be acyclic', async () => {
  const { validateGraphStructure } = await import('../packages/runtime/dist/index.js');
  const cyclic = {
    ...baseGraph,
    edges: [
      { from: 'a', to: 'b', type: 'depends-on' },
      { from: 'a', to: 'b', type: 'blocks' }
    ]
  };
  assert.throws(() => validateGraphStructure(cyclic), error => error?.code === 'GRAPH_CYCLE');
});

test('contract revisions increment exactly one', async () => {
  const { assertNextContractRevision } = await import('../packages/runtime/dist/index.js');
  assert.doesNotThrow(() => assertNextContractRevision(undefined, 1));
  assert.doesNotThrow(() => assertNextContractRevision(1, 2));
  assert.throws(() => assertNextContractRevision(1, 3), error => error?.code === 'INVALID_REVISION');
  assert.throws(() => assertNextContractRevision(undefined, 2), error => error?.code === 'INVALID_REVISION');
});

test('lifecycle rules reject terminal-state reopening', async () => {
  const { assertTransition } = await import('../packages/runtime/dist/index.js');
  assert.doesNotThrow(() => assertTransition('mission', 'active', 'paused'));
  assert.doesNotThrow(() => assertTransition('work-node', 'failed', 'ready'));
  assert.throws(() => assertTransition('mission', 'completed', 'active'), error => error?.code === 'INVALID_TRANSITION');
  assert.throws(() => assertTransition('work-node', 'cancelled', 'ready'), error => error?.code === 'INVALID_TRANSITION');
});
