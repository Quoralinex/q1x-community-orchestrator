import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BrowserSessionManager, createDefaultBrowserBackendRegistry } from '../packages/runtime/dist/index.js';
import { browserExecutable, startBrowserSite } from './helpers/browser-test-runtime.mjs';

const selector = value => ({ by:'selector', value });

test('browser mouse, drag, upload, download and screenshot are bounded and functional', async t => {
  const executablePath = await browserExecutable();
  const home = await mkdtemp(join(tmpdir(), 'q1x-browser-io-'));
  const downloads = join(home, 'outputs');
  const uploads = join(home, 'uploads');
  await import('node:fs/promises').then(({mkdir}) => Promise.all([mkdir(downloads), mkdir(uploads)]));
  const uploadPath = join(uploads, 'upload.txt'); await writeFile(uploadPath, 'upload fixture');
  t.after(() => rm(home, {recursive:true,force:true}));
  const site = await startBrowserSite(); t.after(() => site.close());
  const manager = new BrowserSessionManager(createDefaultBrowserBackendRegistry()); t.after(() => manager.closeAll());
  const session = await manager.openSession({
    contractVersion:'1.0.0', id:'browser.io', name:'Browser IO', backend:'playwright', mode:'managed', engine:'chromium',
    headless:true, executablePath, downloadDir:downloads, fileAccessRoots:[uploads], timeoutMs:60000
  });
  const result = await manager.execute(session.id, { contractVersion:'1.0.0', id:'batch.io', actions:[
    {id:'nav',kind:'navigate',url:`${site.baseUrl}/index.html`},
    {id:'move',kind:'mouse-move',x:20,y:410}, {id:'down',kind:'mouse-down',button:'left'}, {id:'up',kind:'mouse-up',button:'left'},
    {id:'mouse-down-state',kind:'extract',target:selector('#mouse-pad'),extract:'attribute',attribute:'data-down'},
    {id:'mouse-up-state',kind:'extract',target:selector('#mouse-pad'),extract:'attribute',attribute:'data-up'},
    {id:'wheel',kind:'wheel',deltaX:0,deltaY:700},
    {id:'drag',kind:'drag',source:selector('#drag-source'),target:selector('#drop-target')},
    {id:'dropped',kind:'extract',target:selector('#drop-target'),extract:'attribute',attribute:'data-dropped'},
    {id:'upload',kind:'upload',target:selector('#upload'),paths:[uploadPath]},
    {id:'upload-name',kind:'extract',target:selector('#upload-status'),extract:'text'},
    {id:'download',kind:'download',target:selector('#download-link'),outputPath:'fixture.txt'},
    {id:'screenshot',kind:'screenshot',outputPath:'fixture.png',fullPage:true}
  ]});
  assert.equal(result.status,'succeeded');
  const outputs = new Map(result.actions.map(action=>[action.id,action.output]));
  assert.equal(outputs.get('mouse-down-state'),'yes');
  assert.equal(outputs.get('mouse-up-state'),'yes');
  assert.equal(outputs.get('dropped'),'yes');
  assert.equal(outputs.get('upload-name'),'upload.txt');
  assert.equal((await readFile(join(downloads,'fixture.txt'),'utf8')).trim(),'q1x-download-fixture');
  assert.ok((await stat(join(downloads,'fixture.png'))).size > 100);
});

test('browser file actions reject paths outside configured roots', async t => {
  const executablePath = await browserExecutable();
  const home = await mkdtemp(join(tmpdir(), 'q1x-browser-bounds-')); const downloads=join(home,'outputs'); const uploads=join(home,'uploads');
  await import('node:fs/promises').then(({mkdir}) => Promise.all([mkdir(downloads),mkdir(uploads)]));
  const outside=join(home,'outside.txt'); await writeFile(outside,'outside');
  t.after(()=>rm(home,{recursive:true,force:true}));
  const site=await startBrowserSite(); t.after(()=>site.close());
  const manager=new BrowserSessionManager(createDefaultBrowserBackendRegistry()); t.after(()=>manager.closeAll());
  const session=await manager.openSession({contractVersion:'1.0.0',id:'browser.bounds',name:'Bounds',backend:'playwright',mode:'managed',engine:'chromium',headless:true,executablePath,downloadDir:downloads,fileAccessRoots:[uploads],timeoutMs:60000});
  const result=await manager.execute(session.id,{contractVersion:'1.0.0',id:'batch.bounds',actions:[
    {id:'nav',kind:'navigate',url:`${site.baseUrl}/index.html`},
    {id:'bad-upload',kind:'upload',target:selector('#upload'),paths:[outside]}
  ]});
  assert.equal(result.status,'failed');
  assert.equal(result.actions.at(-1).error.code,'INSECURE_ENDPOINT');
});
