import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const cli = join(root,'packages/runtime/dist/cli.js');
function run(home,...args){ return spawnSync(process.execPath,[cli,'--home',home,...args],{encoding:'utf8'}); }
function success(result){ assert.equal(result.status,0,result.stderr); return JSON.parse(result.stdout); }
async function json(home,name,value){ const target=join(home,name); await writeFile(target,JSON.stringify(value)); return target; }
const now='2026-09-07T21:15:00Z';

test('q1x CLI configures bindings, forms teams and validates programme proposals', async t => {
  const home=await mkdtemp(join(tmpdir(),'q1x-phase7-cli-')); t.after(()=>rm(home,{recursive:true,force:true}));
  const mission={contractVersion:'1.0.0',id:'mission.cli.supervision',title:'CLI supervision',objective:'Exercise Phase 7 CLI',status:'active',outcomes:[{id:'outcome.cli',description:'Done',successCriteria:['Done']}],constraints:{},createdAt:now};
  const programme={contractVersion:'1.0.0',id:'programme.cli.supervision',missionId:mission.id,revision:1,status:'active',workstreams:[{id:'ws.cli',title:'CLI',objective:'CLI',status:'active'}],createdAt:now,updatedAt:now};
  const graph={contractVersion:'1.0.0',id:'graph.cli.supervision',programmeId:programme.id,revision:1,nodes:[{id:'task.cli',kind:'task',title:'CLI task',parentId:'ws.cli',status:'ready',capabilityRequirements:[{operation:'execute',adapterKinds:['cli-tui']}]}],edges:[],updatedAt:now};
  const capability={contractVersion:'1.0.0',id:'capability.cli.supervision',name:'CLI supervision worker',adapterKind:'cli-tui',operations:['execute'],modalities:{input:['structured-data'],output:['structured-data']},availability:{state:'available',checkedAt:now},cost:{class:'no-usage-fee'},privacy:{executionLocation:'local',dataRetention:'none'},trust:{level:'validated',validatedAt:now},platforms:['linux','macos','windows']};
  const binding={contractVersion:'1.0.0',id:'binding.cli.supervision',capabilityId:capability.id,executorKind:'external',operations:['execute'],enabled:true,priority:10};
  const policy={contractVersion:'1.0.0',id:'policy.cli.supervision',maxConcurrentAssignments:1,maxAttemptsPerWorkItem:2,preferNoUsageFee:true,preferLocal:true,allowUnknownCost:false,stopConditions:['completed','idle','blocked','approval-required','budget-exhausted','replan-required']};
  const proposal={contractVersion:'1.0.0',id:'proposal.cli.supervision',missionId:mission.id,programme:{...programme,revision:2,updatedAt:'2026-09-07T21:16:00Z'},workGraph:{...graph,revision:2,updatedAt:'2026-09-07T21:16:00Z'},rationale:'Validated CLI replan',plannerStrategyId:'manual',proposedAt:'2026-09-07T21:16:00Z'};

  success(run(home,'mission','put','--file',await json(home,'mission.json',mission)));
  success(run(home,'programme','put','--file',await json(home,'programme.json',programme)));
  success(run(home,'graph','put','--file',await json(home,'graph.json',graph)));
  success(run(home,'capabilities','put','--file',await json(home,'capability.json',capability)));
  assert.equal(success(run(home,'bindings','put','--file',await json(home,'binding.json',binding))).id,binding.id);
  assert.equal(success(run(home,'bindings','list')).length,1);
  const team=success(run(home,'team','form',programme.id,'--policy',await json(home,'policy.json',policy)));
  assert.equal(team.members.length,1);
  assert.equal(success(run(home,'team','assignments',programme.id)).length,1);
  const validation=success(run(home,'proposal','validate','--file',await json(home,'proposal.json',proposal)));
  assert.equal(validation.valid,true);
  const accepted=success(run(home,'proposal','accept','--file',join(home,'proposal.json')));
  assert.equal(accepted.programme.revision,2);
});
