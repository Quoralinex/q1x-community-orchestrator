import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const cli = join(root, 'packages/runtime/dist/cli.js');
const now = '2026-09-08T10:00:00Z';

function run(home, ...args) {
  return spawnSync(process.execPath, [cli, '--home', home, ...args], { encoding: 'utf8' });
}

function success(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function json(home, name, value) {
  const target = join(home, name);
  await writeFile(target, JSON.stringify(value));
  return target;
}

test('security CLI manages single-use approvals, evidence, audit verification and recovery', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-security-cli-'));
  t.after(() => rm(home, { recursive: true, force: true }));

  const mission = {
    contractVersion: '1.0.0', id: 'mission.security.cli', title: 'Security CLI', objective: 'Exercise governance CLI',
    status: 'active', outcomes: [{ id: 'outcome.security.cli', description: 'Governed', successCriteria: ['Governed'] }],
    constraints: {}, createdAt: now
  };
  const programme = {
    contractVersion: '1.0.0', id: 'programme.security.cli', missionId: mission.id, revision: 1, status: 'active',
    workstreams: [{ id: 'ws.security.cli', title: 'Security', objective: 'Governed work', status: 'active' }],
    createdAt: now, updatedAt: now
  };
  const graph = {
    contractVersion: '1.0.0', id: 'graph.security.cli', programmeId: programme.id, revision: 1,
    nodes: [{ id: 'task.security.cli', kind: 'task', title: 'Protected task', parentId: 'ws.security.cli', status: 'ready', approvalRequired: true }],
    edges: [], updatedAt: now
  };
  const approval = {
    contractVersion: '1.0.0', id: 'approval.security.cli', subject: { id: 'task.security.cli', kind: 'task' },
    state: 'pending', requestedAt: now, requestedBy: { id: 'agent.supervisor', kind: 'agent' }, requiredApproverKinds: ['human']
  };
  const decision = {
    actor: { id: 'human.owner', kind: 'human' }, action: 'approve', decidedAt: '2026-09-08T10:01:00Z', reason: 'Reviewed.'
  };
  const evidence = {
    contractVersion: '1.0.0', id: 'evidence.security.cli', kind: 'test-result', summary: 'Security CLI test evidence.',
    executionRef: 'execution.security.cli', resultRef: 'result.security.cli',
    contentDigest: { algorithm: 'sha256', value: 'b'.repeat(64) },
    provenance: { actor: { id: 'service.ci', kind: 'service' }, method: 'node-test' }, collectedAt: '2026-09-08T10:02:00Z'
  };

  success(run(home, 'mission', 'put', '--file', await json(home, 'mission.json', mission)));
  success(run(home, 'programme', 'put', '--file', await json(home, 'programme.json', programme)));
  success(run(home, 'graph', 'put', '--file', await json(home, 'graph.json', graph)));

  const requested = success(run(home, 'approval', 'request', '--file', await json(home, 'approval.json', approval)));
  assert.equal(requested.state, 'pending');
  assert.equal(success(run(home, 'approval', 'list', '--programme', programme.id)).length, 1);
  assert.equal(success(run(home, 'approval', 'show', approval.id)).id, approval.id);

  const unauthorized = run(home, 'approval', 'apply', approval.id);
  assert.equal(unauthorized.status, 1);
  assert.equal(JSON.parse(unauthorized.stderr).error.code, 'AUTHORIZATION_REQUIRED');

  const decided = success(run(home, 'approval', 'decide', approval.id, '--file', await json(home, 'decision.json', decision)));
  assert.equal(decided.state, 'approved');
  const applied = success(run(home, 'approval', 'apply', approval.id));
  assert.equal(applied.approval.state, 'consumed');
  assert.equal(applied.workGraph.nodes.find(node => node.id === 'task.security.cli').approvalRequired, false);

  assert.equal(success(run(home, 'evidence', 'record', '--file', await json(home, 'evidence.json', evidence), '--programme', programme.id)).id, evidence.id);
  assert.equal(success(run(home, 'evidence', 'list', '--programme', programme.id)).length, 1);
  assert.equal(success(run(home, 'evidence', 'show', evidence.id)).id, evidence.id);

  const verification = success(run(home, 'audit', 'verify'));
  assert.equal(verification.valid, true);
  assert.ok(verification.checked >= 4);
  assert.ok(success(run(home, 'audit', 'list')).length >= 4);

  const recovery = success(run(home, 'recovery', 'reconcile', '--programme', programme.id));
  assert.deepEqual(recovery, { assignments: [], workGraphs: [] });
});
