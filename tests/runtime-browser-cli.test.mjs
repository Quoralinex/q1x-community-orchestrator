import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { browserExecutable, startBrowserSite } from './helpers/browser-test-runtime.mjs';

const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const cli=join(root,'packages/runtime/dist/cli.js');
function run(home,...args){return new Promise(resolve=>{const child=spawn(process.execPath,[cli,'--home',home,...args],{cwd:root,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('close',status=>resolve({status,stdout,stderr}));});}
function success(result){assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}

test('q1x CLI persists, discovers and executes a browser endpoint',async t=>{
  const executablePath=await browserExecutable(); const site=await startBrowserSite(); t.after(()=>site.close());
  const home=await mkdtemp(join(tmpdir(),'q1x-browser-cli-')); t.after(()=>rm(home,{recursive:true,force:true}));
  const endpointPath=join(home,'endpoint.json'); const batchPath=join(home,'batch.json');
  await writeFile(endpointPath,JSON.stringify({contractVersion:'1.0.0',id:'browser.cli',name:'CLI browser',backend:'playwright',mode:'managed',engine:'chromium',headless:true,executablePath,timeoutMs:60000,navigation:{allowedOrigins:[new URL(site.baseUrl).origin]}}));
  await writeFile(batchPath,JSON.stringify({contractVersion:'1.0.0',id:'browser.batch.cli',actions:[{id:'nav',kind:'navigate',url:`${site.baseUrl}/index.html`},{id:'extract',kind:'extract',target:{by:'selector',value:'h1'},extract:'text'}]}));
  assert.equal(success(await run(home,'browser-endpoints','put','--file',endpointPath)).id,'browser.cli');
  assert.equal(success(await run(home,'browser-endpoints','list')).length,1);
  assert.equal(success(await run(home,'browser-endpoints','get','browser.cli')).backend,'playwright');
  const capability=success(await run(home,'browser','discover','browser.cli'));
  assert.equal(capability.adapterKind,'browser-control');
  const result=success(await run(home,'browser','run','browser.cli','--file',batchPath));
  assert.equal(result.status,'succeeded');
  assert.equal(result.actions.at(-1).output,'Browser Fixture');
});
