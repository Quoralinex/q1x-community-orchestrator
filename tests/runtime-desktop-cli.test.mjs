import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const cli=join(root,'packages/runtime/dist/cli.js');
function run(home,...args){return new Promise(resolve=>{const child=spawn(process.execPath,[cli,'--home',home,...args],{cwd:root,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('close',status=>resolve({status,stdout,stderr}));});}
function success(result){assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}

test('q1x CLI persists, discovers and runs a desktop endpoint',async t=>{
  if(process.platform!=='darwin') t.skip('macOS-native CLI smoke test');
  const home=await mkdtemp(join(tmpdir(),'q1x-desktop-cli-'));
  t.after(()=>rm(home,{recursive:true,force:true}));
  const endpointPath=join(home,'endpoint.json');
  const batchPath=join(home,'batch.json');
  await writeFile(endpointPath,JSON.stringify({
    contractVersion:'1.0.0', id:'desktop.cli', name:'CLI desktop', backend:'macos-native',
    platforms:['macos'], timeoutMs:5000,
    allowedApplications:[{id:'notes',name:'Notes',selectors:[{platform:'macos',kind:'bundle-id',value:'com.apple.Notes'}]}]
  }));
  await writeFile(batchPath,JSON.stringify({
    contractVersion:'1.0.0', id:'desktop.batch.cli',
    actions:[{id:'wait',kind:'wait',milliseconds:1}]
  }));
  assert.equal(success(await run(home,'desktop-endpoints','put','--file',endpointPath)).id,'desktop.cli');
  assert.equal(success(await run(home,'desktop-endpoints','list')).length,1);
  assert.equal(success(await run(home,'desktop-endpoints','get','desktop.cli')).backend,'macos-native');
  const capability=success(await run(home,'desktop','discover','desktop.cli'));
  assert.equal(capability.adapterKind,'desktop-control');
  assert.equal(capability.availability.state,'available');
  const result=success(await run(home,'desktop','run','desktop.cli','--file',batchPath));
  assert.equal(result.status,'succeeded');
  assert.equal(result.actions[0].id,'wait');
});
