import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { OpenControlRuntime, RuntimeError } from '../packages/runtime/dist/index.js';
import { browserExecutable, startBrowserSite } from './helpers/browser-test-runtime.mjs';

function endpoint(home, executablePath, baseUrl) {
  return {
    contractVersion:'1.0.0', id:'browser.runtime', name:'Runtime browser', backend:'playwright', mode:'managed',
    engine:'chromium', headless:true, executablePath, timeoutMs:60000,
    downloadDir:join(home,'downloads'), fileAccessRoots:[home],
    navigation:{ allowedOrigins:[new URL(baseUrl).origin] }
  };
}

test('runtime browser sessions are memory-only and one-shot audit is metadata-only', async t => {
  const executablePath=await browserExecutable(); const site=await startBrowserSite(); t.after(()=>site.close());
  const home=await mkdtemp(join(tmpdir(),'q1x-browser-runtime-')); t.after(()=>rm(home,{recursive:true,force:true}));
  let runtime=OpenControlRuntime.open({home});
  runtime.putBrowserEndpoint(endpoint(home,executablePath,site.baseUrl));
  const handle=await runtime.openBrowserSession('browser.runtime');
  const secret='BROWSER-SECRET-MUST-NOT-PERSIST-9917';
  const result=await runtime.executeBrowserSession(handle.id,{contractVersion:'1.0.0',id:'batch.runtime',actions:[
    {id:'nav',kind:'navigate',url:`${site.baseUrl}/index.html`},
    {id:'fill',kind:'fill',target:{by:'selector',value:'#name'},text:secret},
    {id:'extract',kind:'extract',target:{by:'selector',value:'#name'},extract:'attribute',attribute:'value'}
  ]});
  assert.equal(result.status,'succeeded');
  assert.equal(result.actions.at(-1).output,secret);
  await runtime.closeBrowserSession(handle.id);
  runtime.close();
  const db=new DatabaseSync(join(home,'state.sqlite'));
  const rows=db.prepare("SELECT event_type,payload_json FROM runtime_events WHERE event_type LIKE 'browser.%' ORDER BY sequence").all();
  db.close();
  const serialized=JSON.stringify(rows);
  assert.equal(serialized.includes(secret),false);
  assert.match(serialized,/browser\.execute/);
  runtime=OpenControlRuntime.open({home});
  await assert.rejects(()=>runtime.closeBrowserSession(handle.id),e=>e instanceof RuntimeError && e.code==='NOT_FOUND');
  runtime.close();
});

test('runtime browser navigation policy blocks schemes and disallowed origins', async t => {
  const executablePath=await browserExecutable(); const site=await startBrowserSite(); t.after(()=>site.close());
  const home=await mkdtemp(join(tmpdir(),'q1x-browser-origin-')); t.after(()=>rm(home,{recursive:true,force:true}));
  const runtime=OpenControlRuntime.open({home}); t.after(()=>runtime.close());
  runtime.putBrowserEndpoint(endpoint(home,executablePath,site.baseUrl));
  const fileResult=await runtime.runBrowserBatch('browser.runtime',{contractVersion:'1.0.0',id:'batch.file',actions:[{id:'bad',kind:'navigate',url:'file:///etc/passwd'}]});
  assert.equal(fileResult.status,'failed');
  assert.equal(fileResult.actions[0].error.code,'INSECURE_ENDPOINT');
  const originResult=await runtime.runBrowserBatch('browser.runtime',{contractVersion:'1.0.0',id:'batch.origin',actions:[{id:'bad',kind:'navigate',url:'https://example.com'}]});
  assert.equal(originResult.status,'failed');
  assert.equal(originResult.actions[0].error.code,'INSECURE_ENDPOINT');
  const blocked=await startBrowserSite(); t.after(()=>blocked.close());
  const redirectUrl=`${site.baseUrl}/redirect?to=${encodeURIComponent(`${blocked.baseUrl}/second.html`)}`;
  const redirectResult=await runtime.runBrowserBatch('browser.runtime',{contractVersion:'1.0.0',id:'batch.redirect',actions:[{id:'redirect',kind:'navigate',url:redirectUrl}]});
  assert.equal(redirectResult.status,'failed');
  assert.equal(blocked.requests.includes('/second.html'),false);
});

test('runtime browser cancellation and discovery are normalized and persisted', async t => {
  const executablePath=await browserExecutable(); const site=await startBrowserSite(); t.after(()=>site.close());
  const home=await mkdtemp(join(tmpdir(),'q1x-browser-cancel-')); t.after(()=>rm(home,{recursive:true,force:true}));
  const runtime=OpenControlRuntime.open({home}); t.after(()=>runtime.close());
  runtime.putBrowserEndpoint(endpoint(home,executablePath,site.baseUrl));
  const handle=await runtime.openBrowserSession('browser.runtime');
  const controller=new AbortController(); controller.abort();
  const cancelled=await runtime.executeBrowserSession(handle.id,{contractVersion:'1.0.0',id:'batch.cancel',actions:[{id:'wait',kind:'wait',milliseconds:1000}]},controller.signal);
  assert.equal(cancelled.status,'cancelled');
  await runtime.closeBrowserSession(handle.id);
  const capability=runtime.discoverBrowserCapability('browser.runtime');
  assert.equal(capability.adapterKind,'browser-control');
  assert.equal(capability.availability.state,'available');
  assert.ok(capability.operations.includes('navigate'));
  assert.equal(runtime.getCapability(capability.id).id,capability.id);
});
