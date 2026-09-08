import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'q1x-security-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime } = await import('../packages/runtime/dist/index.js');
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.putMission(await json('examples/company-launch/mission.json'));
  runtime.putProgramme(await json('examples/company-launch/programme.json'));
  runtime.putWorkGraph(await json('examples/company-launch/work-graph.json'));
  return { home, runtime };
}

function pendingApproval(id = 'approval.company-docs') {
  return {
    contractVersion: '1.0.0',
    id,
    subject: { id: 'task.company-docs', kind: 'task' },
    state: 'pending',
    requestedAt: new Date().toISOString(),
    requestedBy: { id: 'agent.supervisor', kind: 'agent' },
    requiredApproverKinds: ['human']
  };
}

function humanApprovalDecision() {
  return {
    actor: { id: 'human.owner', kind: 'human' },
    action: 'approve',
    decidedAt: new Date().toISOString(),
    reason: 'Reviewed consequential company filing work.'
  };
}

test('protected work stays fail-closed until a matching single-use approval is applied', async t => {
  const { runtime } = await fixture(t);
  const approval = runtime.requestApproval(pendingApproval());
  assert.equal(approval.state, 'pending');
  assert.throws(() => runtime.applyApproval(approval.id), error => error.code === 'AUTHORIZATION_REQUIRED');
  assert.throws(() => runtime.decideApproval(approval.id, {
    actor: { id: 'agent.other', kind: 'agent' }, action: 'approve', decidedAt: new Date().toISOString()
  }), error => error.code === 'AUTHORIZATION_REQUIRED');

  const decided = runtime.decideApproval(approval.id, humanApprovalDecision());
  assert.equal(decided.state, 'approved');
  const applied = runtime.applyApproval(approval.id);
  assert.equal(applied.approval.state, 'consumed');
  assert.equal(applied.workGraph.revision, 2);
  assert.equal(applied.workGraph.nodes.find(node => node.id === 'task.company-docs').approvalRequired, false);
  assert.ok(runtime.listCheckpoints('programme.company-launch').some(checkpoint => checkpoint.id === applied.checkpointId));
  assert.throws(() => runtime.applyApproval(approval.id), error => error.code === 'AUTHORIZATION_REQUIRED');
  assert.equal(runtime.verifyAuditChain().valid, true);
});

test('approval subject kind must exactly match a known work item', async t => {
  const { runtime } = await fixture(t);
  assert.throws(() => runtime.requestApproval({
    ...pendingApproval('approval.wrong-kind'),
    subject: { id: 'task.company-docs', kind: 'programme' }
  }), error => error.code === 'INVALID_REFERENCE');
});

test('approval request rejects ambiguous work item ids across programmes', async t => {
  const { runtime } = await fixture(t);
  const now = new Date().toISOString();
  runtime.putProgramme({
    contractVersion: '1.0.0', id: 'programme.duplicate-work', missionId: 'mission.company-launch', revision: 1, status: 'active',
    workstreams: [{ id: 'ws.duplicate', title: 'Duplicate', objective: 'Prove ambiguity is rejected', status: 'active' }],
    createdAt: now, updatedAt: now
  });
  runtime.putWorkGraph({
    contractVersion: '1.0.0', id: 'graph.duplicate-work', programmeId: 'programme.duplicate-work', revision: 1,
    nodes: [{ id: 'task.company-docs', kind: 'task', title: 'Duplicate protected work', parentId: 'ws.duplicate', status: 'ready', approvalRequired: true }],
    edges: [], updatedAt: now
  });
  assert.throws(() => runtime.requestApproval(pendingApproval('approval.ambiguous-work')), error => error.code === 'CONFLICT');
});

test('approval application restores its checkpoint if post-update security audit fails', async t => {
  const { runtime } = await fixture(t);
  const approval = runtime.requestApproval(pendingApproval('approval.rollback'));
  runtime.decideApproval(approval.id, humanApprovalDecision());
  const originalAudit = runtime.appendAuditReceipt.bind(runtime);
  runtime.appendAuditReceipt = (eventType, ...args) => {
    if (eventType === 'approval.consumed') throw new Error('injected audit failure');
    return originalAudit(eventType, ...args);
  };
  assert.throws(() => runtime.applyApproval(approval.id), /injected audit failure/);
  runtime.appendAuditReceipt = originalAudit;
  const graph = runtime.getWorkGraph('graph.company-launch');
  assert.equal(graph.revision, 1);
  assert.equal(graph.nodes.find(node => node.id === 'task.company-docs').approvalRequired, true);
  assert.equal(runtime.getApproval(approval.id).state, 'approved');
  assert.ok(runtime.listCheckpoints('programme.company-launch').some(checkpoint => checkpoint.id === `checkpoint.approval.${approval.id}`));
  assert.equal(runtime.verifyAuditChain().valid, true);
});

test('invalid audit subjects are rejected before any receipt is persisted', async t => {
  const { runtime } = await fixture(t);
  const before = runtime.listAuditReceipts().length;
  assert.throws(() => runtime.appendAuditReceipt('security.invalid', { id: 'invalid subject id', kind: 'programme' }), error => error.code === 'SCHEMA_INVALID');
  assert.equal(runtime.listAuditReceipts().length, before);
  assert.equal(runtime.verifyAuditChain().valid, true);
});

test('evidence is immutable and carries bounded execution/result provenance', async t => {
  const { runtime } = await fixture(t);
  const evidence = {
    contractVersion: '1.0.0', id: 'evidence.test.1', kind: 'test-result', summary: 'Deterministic verification passed.',
    executionRef: 'execution.test.1', resultRef: 'result.test.1',
    contentDigest: { algorithm: 'sha256', value: 'a'.repeat(64) },
    provenance: { actor: { id: 'service.ci', kind: 'service' }, method: 'node-test' },
    collectedAt: new Date().toISOString()
  };
  runtime.recordEvidence(evidence, 'programme.company-launch');
  assert.deepEqual(runtime.getEvidence(evidence.id), evidence);
  assert.throws(() => runtime.recordEvidence({ ...evidence, summary: 'Changed' }, 'programme.company-launch'), error => error.code === 'CONFLICT');
});

test('audit receipts redact secret-shaped metadata and detect tampering', async t => {
  const { home, runtime } = await fixture(t);
  runtime.appendAuditReceipt('security.test', { id: 'programme.company-launch', kind: 'programme' }, 'programme.company-launch', {
    apiKey: 'do-not-store', nested: { authorization: 'Bearer secret', safe: 42 }
  });
  const receipt = runtime.listAuditReceipts().at(-1);
  assert.equal(receipt.metadata.apiKey, '[REDACTED]');
  assert.equal(receipt.metadata.nested.authorization, '[REDACTED]');
  assert.equal(receipt.metadata.nested.safe, 42);
  assert.equal(runtime.verifyAuditChain().valid, true);

  const db = new DatabaseSync(join(home, 'state.sqlite'));
  db.prepare('UPDATE security_audit_receipts SET metadata_json = ? WHERE sequence = ?').run(JSON.stringify({ safe: 'tampered' }), receipt.sequence);
  db.close();
  const verification = runtime.verifyAuditChain();
  assert.equal(verification.valid, false);
  assert.equal(verification.firstInvalidSequence, receipt.sequence);
});

test('restart reconciliation checkpoints and marks abandoned running work interrupted', async t => {
  const { home, runtime } = await fixture(t);
  const graph = runtime.getWorkGraph('graph.company-launch');
  runtime.putWorkGraph({
    ...graph,
    revision: 2,
    nodes: graph.nodes.map(node => node.id === 'task.market-research' ? { ...node, status: 'running' } : node),
    updatedAt: new Date().toISOString()
  });
  const { SqliteStore } = await import('../packages/runtime/dist/index.js');
  const store = SqliteStore.open(home);
  store.putDocument({
    kind: 'work-assignment', id: 'assignment.recovery.1', scopeId: 'programme.company-launch',
    document: {
      contractVersion: '1.0.0', id: 'assignment.recovery.1', programmeId: 'programme.company-launch',
      workGraphId: 'graph.company-launch', workGraphRevision: 2, workItemId: 'task.market-research',
      teamPlanId: 'team.recovery.1', teamMemberId: 'member.recovery.1', bindingId: 'binding.recovery.1', capabilityId: 'capability.recovery.1',
      attempt: 1, requirements: { operations: ['research'], inputModalities: ['text'], outputModalities: ['document'] },
      status: 'running', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }
  });
  store.close();

  const recovered = runtime.reconcileInterruptedAssignments('programme.company-launch');
  assert.equal(recovered.assignments.length, 1);
  assert.equal(recovered.assignments[0].status, 'interrupted');
  assert.equal(recovered.workGraphs[0].nodes.find(node => node.id === 'task.market-research').status, 'blocked');
  assert.ok(runtime.listCheckpoints('programme.company-launch').some(checkpoint => checkpoint.id.startsWith('checkpoint.recovery.')));
  assert.equal(runtime.verifyAuditChain().valid, true);
});
