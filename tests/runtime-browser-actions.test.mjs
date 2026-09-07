import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserSessionManager, createDefaultBrowserBackendRegistry } from '../packages/runtime/dist/index.js';
import { browserExecutable, startBrowserSite } from './helpers/browser-test-runtime.mjs';

function bySelector(value) { return { by: 'selector', value }; }

test('browser batch navigates, inspects and controls a real page', async t => {
  const executablePath = await browserExecutable();
  const site = await startBrowserSite();
  t.after(() => site.close());
  const manager = new BrowserSessionManager(createDefaultBrowserBackendRegistry());
  t.after(() => manager.closeAll());
  const session = await manager.openSession({
    contractVersion:'1.0.0', id:'browser.actions', name:'Actions', backend:'playwright', mode:'managed',
    engine:'chromium', headless:true, executablePath, timeoutMs:60000
  });
  const result = await manager.execute(session.id, {
    contractVersion:'1.0.0', id:'batch.actions', actions:[
      { id:'nav', kind:'navigate', url:`${site.baseUrl}/index.html` },
      { id:'inspect', kind:'inspect' },
      { id:'extract-title', kind:'extract', target:bySelector('h1'), extract:'text' },
      { id:'click', kind:'click', target:bySelector('#click-button') },
      { id:'status-click', kind:'extract', target:bySelector('#status'), extract:'text' },
      { id:'double', kind:'double-click', target:bySelector('#double-button') },
      { id:'hover', kind:'hover', target:bySelector('#hover-target') },
      { id:'hovered', kind:'extract', target:bySelector('#hover-target'), extract:'attribute', attribute:'data-hovered' },
      { id:'fill', kind:'fill', target:{by:'label',value:'Name'}, text:'Ada' },
      { id:'type', kind:'type', target:{by:'placeholder',value:'Your name'}, text:' Lovelace' },
      { id:'name', kind:'extract', target:bySelector('#name'), extract:'attribute', attribute:'value' },
      { id:'select', kind:'select', target:bySelector('#choice'), values:['b'] },
      { id:'choice', kind:'extract', target:bySelector('#choice'), extract:'attribute', attribute:'value' },
      { id:'check', kind:'check', target:bySelector('#accept') },
      { id:'uncheck', kind:'uncheck', target:bySelector('#accept') },
      { id:'fill-key', kind:'fill', target:{by:'role',role:'textbox',name:'Key input'}, text:'go' },
      { id:'press', kind:'press', target:bySelector('#key-input'), key:'Enter' },
      { id:'wait', kind:'wait', target:bySelector('#status'), timeoutMs:2000 }
    ]
  });
  assert.equal(result.status, 'succeeded');
  const outputs = new Map(result.actions.map(action => [action.id, action.output]));
  assert.equal(outputs.get('extract-title'), 'Browser Fixture');
  assert.equal(outputs.get('status-click'), 'clicked');
  assert.equal(outputs.get('hovered'), 'yes');
  assert.equal(outputs.get('name'), 'Ada Lovelace');
  assert.equal(outputs.get('choice'), 'b');
  const inspect = outputs.get('inspect');
  assert.equal(inspect.title, 'Q1X Browser Fixture');
  assert.match(inspect.text, /Browser Fixture/);
  assert.equal(JSON.stringify(inspect).includes('super-secret'), false);
});

test('browser batch supports history and reload without losing control', async t => {
  const executablePath = await browserExecutable();
  const site = await startBrowserSite(); t.after(() => site.close());
  const manager = new BrowserSessionManager(createDefaultBrowserBackendRegistry()); t.after(() => manager.closeAll());
  const session = await manager.openSession({ contractVersion:'1.0.0', id:'browser.history', name:'History', backend:'playwright', mode:'managed', engine:'chromium', headless:true, executablePath, timeoutMs:60000 });
  const result = await manager.execute(session.id, { contractVersion:'1.0.0', id:'batch.history', actions:[
    {id:'home',kind:'navigate',url:`${site.baseUrl}/index.html`}, {id:'second',kind:'navigate',url:`${site.baseUrl}/second.html`},
    {id:'back',kind:'back'}, {id:'back-title',kind:'extract',target:bySelector('h1'),extract:'text'},
    {id:'forward',kind:'forward'}, {id:'forward-title',kind:'extract',target:bySelector('h1'),extract:'text'}, {id:'reload',kind:'reload'}
  ]});
  const outputs = new Map(result.actions.map(action => [action.id, action.output]));
  assert.equal(outputs.get('back-title'), 'Browser Fixture');
  assert.equal(outputs.get('forward-title'), 'Second Page');
  assert.equal(result.status, 'succeeded');
});
