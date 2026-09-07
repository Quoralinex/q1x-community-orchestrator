import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const now = '2026-09-07T21:00:00Z';
const policy = overrides => ({
  contractVersion: '1.0.0', id: 'policy.phase7.extended', maxConcurrentAssignments: 1,
  maxAttemptsPerWorkItem: 2, preferNoUsageFee: true, preferLocal: true,
  allowUnknownCost: false, stopConditions: ['completed','idle','blocked','approval-required','budget-exhausted','replan-required'],
  ...overrides
});
const capability = (id, overrides = {}) => ({
  contractVersion:'1.0.0', id, name:id, adapterKind:'cli-tui', operations:['execute'],
  modalities:{input:['structured-data'],output:['structured-data']}, availability:{state:'available',checkedAt:now},
  cost:{class:'no-usage-fee'}, privacy:{executionLocation:'local',dataRetention:'none'},
  trust:{level:'validated',validatedAt:now}, platforms:['linux','macos','windows'], ...overrides
});
const binding = (id, capabilityId, priority = 10) => ({
  contractVersion:'1.0.0', id, capabilityId, executorKind:'external', operations:['execute'], enabled:true, priority
});
const mission = { contractVersion:'1.0.0', id:'mission.policy', title:'Policy mission', objective:'Exercise supervision policy', status:'active', outcomes:[{id:'outcome.policy',description:'Done',successCriteria:['Done']}], constraints:{}, createdAt:now };
const programme = { contractVersion:'1.0.0', id:'programme.policy', missionId:mission.id, revision:1, status:'active', workstreams:[{id:'ws.policy',title:'Policy',objective:'Policy',status:'active'}], createdAt:now, updatedAt:now };
function graph(node) { return { contractVersion:'1.0.0', id:'graph.policy', programmeId:programme.id, revision:1, nodes:[{ id:'task.policy',kind:'task',title:'Policy task',parentId:'ws.policy',status:'ready',capabilityRequirements:[{operation:'execute',adapterKinds:['cli-tui']}], ...node }], edges:[], updatedAt:now }; }

async function open(name) {
  const home = await mkdtemp(path.join(tmpdir(), name));
  const { OpenControlRuntime } = await import('../packages/runtime/dist/index.js');
  const runtime = OpenControlRuntime.open({ home });
  runtime.putMission(mission); runtime.putProgramme(programme);
  return { home, runtime };
}

test('approval-required work stops fail-closed before team formation', async () => {
  const { home, runtime } = await open('q1x-phase7-approval-');
  runtime.putWorkGraph(graph({ approvalRequired:true }));
  const cycle = await runtime.runSupervisionCycle(programme.id, policy());
  assert.equal(cycle.stopReason, 'approval-required');
  assert.equal(runtime.listTeamPlans(programme.id).length, 0);
  assert.equal(runtime.listWorkAssignments(programme.id).length, 0);
  runtime.close(); await rm(home,{recursive:true,force:true});
});

test('known-cost budget blocks an unaffordable assignment with budget-exhausted', async () => {
  const { home, runtime } = await open('q1x-phase7-budget-');
  runtime.putWorkGraph(graph());
  runtime.putCapability(capability('cap.metered',{cost:{class:'metered',currency:'EUR',unitCost:0.25,unit:'execution'}}));
  runtime.putExecutionBinding(binding('binding.metered','cap.metered'));
  const cycle = await runtime.runSupervisionCycle(programme.id, policy({maxKnownCost:0.10,currency:'EUR'}));
  assert.equal(cycle.stopReason, 'budget-exhausted');
  assert.equal(runtime.listWorkAssignments(programme.id).length, 0);
  runtime.close(); await rm(home,{recursive:true,force:true});
});

test('failed work is retried on a different eligible binding and then converges', async () => {
  const { home, runtime } = await open('q1x-phase7-replace-');
  runtime.putWorkGraph(graph());
  runtime.putCapability(capability('cap.primary'));
  runtime.putCapability(capability('cap.alternate'));
  runtime.putExecutionBinding(binding('binding.primary','cap.primary',20));
  runtime.putExecutionBinding(binding('binding.alternate','cap.alternate',10));
  runtime.registerWorkExecutor('external',{ id:'test.replacement', async execute({binding}) { return binding.id === 'binding.primary' ? {status:'failed',errorCode:'PRIMARY_FAILED'} : {status:'succeeded'}; } });
  const result = await runtime.superviseUntilStop(programme.id, policy(), {maxCycles:3});
  assert.equal(result.stopReason,'completed');
  const attempts = runtime.listWorkAssignments(programme.id);
  assert.deepEqual(attempts.map(a => [a.attempt,a.bindingId,a.status]), [[1,'binding.primary','failed'],[2,'binding.alternate','succeeded']]);
  runtime.close(); await rm(home,{recursive:true,force:true});
});

test('planned assignments can be cancelled durably', async () => {
  const { home, runtime } = await open('q1x-phase7-cancel-');
  runtime.putWorkGraph(graph());
  runtime.putCapability(capability('cap.cancel'));
  runtime.putExecutionBinding(binding('binding.cancel','cap.cancel'));
  runtime.formTeam(programme.id,{policy:policy()});
  const assignment = runtime.listWorkAssignments(programme.id)[0];
  assert.equal(runtime.cancelWorkAssignment(assignment.id).status,'cancelled');
  runtime.close();
  const { OpenControlRuntime } = await import('../packages/runtime/dist/index.js');
  const reopened = OpenControlRuntime.open({home});
  assert.equal(reopened.getWorkAssignment(assignment.id).status,'cancelled');
  reopened.close(); await rm(home,{recursive:true,force:true});
});
