import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { OpenControlRuntime, RuntimeError } from '../packages/runtime/dist/index.js';

function endpoint() {
  return {
    contractVersion:'1.0.0', id:'desktop.runtime', name:'Runtime desktop', backend:'test-desktop',
    platforms:['macos'], timeoutMs:5000,
    allowedApplications:[{ id:'editor', name:'Editor', selectors:[
      { platform:'macos', kind:'application-name', value:'Test Editor' }
    ] }]
  };
}

function testBackend() {
  return {
    id:'test-desktop',
    async probe() { return { available:true, platform:'macos', operations:['inspect','type','wait'] }; },
    async open(ep) { return { endpointId:ep.id, async close() {} }; },
    async execute(_session, batch, signal) {
      if (signal?.aborted) return {
        contractVersion:'1.0.0', id:`${batch.id}.result`, batchId:batch.id,
        status:'cancelled', actions:[{ id:batch.actions[0].id, status:'cancelled', durationMs:0 }]
      };
      return {
        contractVersion:'1.0.0', id:`${batch.id}.result`, batchId:batch.id,
        status:'succeeded',
        actions:batch.actions.map(action => ({
          id:action.id, status:'succeeded', durationMs:1,
          ...(action.kind === 'inspect' ? { output:{ title:'Test Editor', secret:'VISIBLE-ONLY-IN-RESULT' } } : {})
        }))
      };
    }
  };
}

test('runtime desktop sessions are memory-only and audit is metadata-only', async t => {
  const home=await mkdtemp(join(tmpdir(),'q1x-desktop-runtime-'));
  t.after(()=>rm(home,{recursive:true,force:true}));
  let runtime=OpenControlRuntime.open({home});
  runtime.registerDesktopBackend(testBackend());
  runtime.putDesktopEndpoint(endpoint());
  const handle=await runtime.openDesktopSession('desktop.runtime');
  const secret='DESKTOP-TYPED-SECRET-3319';
  const result=await runtime.executeDesktopSession(handle.id,{
    contractVersion:'1.0.0', id:'desktop.batch.audit', actions:[
      { id:'type', kind:'type', applicationId:'editor', text:secret },
      { id:'inspect', kind:'inspect', applicationId:'editor' }
    ]
  });
  assert.equal(result.status,'succeeded');
  assert.equal(result.actions[1].output.secret,'VISIBLE-ONLY-IN-RESULT');
  await runtime.closeDesktopSession(handle.id);
  runtime.close();

  const db=new DatabaseSync(join(home,'state.sqlite'));
  const rows=db.prepare("SELECT event_type,payload_json FROM runtime_events WHERE event_type LIKE 'desktop.%' ORDER BY sequence").all();
  db.close();
  const serialized=JSON.stringify(rows);
  assert.equal(serialized.includes(secret),false);
  assert.equal(serialized.includes('VISIBLE-ONLY-IN-RESULT'),false);
  assert.match(serialized,/desktop\.execute/);

  runtime=OpenControlRuntime.open({home});
  await assert.rejects(()=>runtime.closeDesktopSession(handle.id),e=>e instanceof RuntimeError && e.code==='NOT_FOUND');
  runtime.close();
});
test('runtime desktop cancellation and discovery are normalized and persisted', async t => {
  const home=await mkdtemp(join(tmpdir(),'q1x-desktop-cancel-'));
  t.after(()=>rm(home,{recursive:true,force:true}));
  const runtime=OpenControlRuntime.open({home});
  t.after(()=>runtime.close());
  runtime.registerDesktopBackend(testBackend());
  runtime.putDesktopEndpoint(endpoint());
  const handle=await runtime.openDesktopSession('desktop.runtime');
  const controller=new AbortController();
  controller.abort();
  const cancelled=await runtime.executeDesktopSession(handle.id,{
    contractVersion:'1.0.0', id:'desktop.batch.cancel',
    actions:[{ id:'wait', kind:'wait', milliseconds:1000 }]
  },controller.signal);
  assert.equal(cancelled.status,'cancelled');
  await runtime.closeDesktopSession(handle.id);

  const capability=await runtime.discoverDesktopCapability('desktop.runtime');
  assert.equal(capability.adapterKind,'desktop-control');
  assert.equal(capability.availability.state,'available');
  assert.deepEqual(capability.operations,['inspect','type','wait']);
  assert.equal(runtime.getCapability(capability.id).id,capability.id);
});

test('runtime enforces desktop allowlist and endpoint policy before backend execution', async t => {
  const home=await mkdtemp(join(tmpdir(),'q1x-desktop-policy-'));
  t.after(()=>rm(home,{recursive:true,force:true}));
  const runtime=OpenControlRuntime.open({home});
  t.after(()=>runtime.close());
  runtime.registerDesktopBackend(testBackend());
  runtime.putDesktopEndpoint({ ...endpoint(), policy:{ allowInput:false, allowCapture:false } });
  const handle=await runtime.openDesktopSession('desktop.runtime');
  await assert.rejects(
    ()=>runtime.executeDesktopSession(handle.id,{ contractVersion:'1.0.0', id:'batch.disallowed', actions:[
      { id:'type', kind:'type', applicationId:'other', text:'blocked' }
    ]}),
    e=>e instanceof RuntimeError && e.code==='INVALID_REFERENCE'
  );
  await assert.rejects(
    ()=>runtime.executeDesktopSession(handle.id,{ contractVersion:'1.0.0', id:'batch.policy', actions:[
      { id:'type', kind:'type', applicationId:'editor', text:'blocked' }
    ]}),
    e=>e instanceof RuntimeError && e.code==='INSECURE_ENDPOINT'
  );
  await runtime.closeDesktopSession(handle.id);
});
