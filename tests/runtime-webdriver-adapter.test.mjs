import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function module() { return import('../packages/runtime/dist/index.js'); }

function execution(id, input) {
  return {
    contractVersion: '1.0.0', id, workItemId: 'work.browser.test',
    requirements: { operations: ['browser.control'], adapterKinds: ['browser-control'] },
    input, createdAt: '2026-09-07T12:00:00Z'
  };
}

async function startWebDriverFixture() {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : undefined });
    res.setHeader('content-type', 'application/json');

    if (req.method === 'GET' && req.url === '/status') {
      res.end(JSON.stringify({ value: { ready: true, message: 'synthetic webdriver' } }));
      return;
    }
    if (req.method === 'POST' && req.url === '/session') {
      res.end(JSON.stringify({ value: { sessionId: 'session-1', capabilities: { browserName: 'synthetic' } } }));
      return;
    }
    if (req.method === 'POST' && req.url === '/session/session-1/url') {
      res.end(JSON.stringify({ value: null }));
      return;
    }
    if (req.method === 'GET' && req.url === '/session/session-1/title') {
      res.end(JSON.stringify({ value: 'Synthetic title' }));
      return;
    }
    if (req.method === 'POST' && req.url === '/session/session-1/element') {
      res.end(JSON.stringify({ value: { 'element-6066-11e4-a52e-4f735466cecf': 'element-1' } }));
      return;
    }
    if (req.method === 'POST' && req.url === '/session/session-1/element/element-1/click') {
      res.end(JSON.stringify({ value: null }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ value: { error: 'unknown command', message: 'unknown fixture route' } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, requests, url: `http://127.0.0.1:${address.port}` };
}

test('webdriver transport maps structured browser actions to W3C HTTP commands', async t => {
  const fixture = await startWebDriverFixture();
  t.after(() => fixture.server.close());
  const home = await mkdtemp(join(tmpdir(), 'q1x-webdriver-'));
  t.after(() => rm(home, { recursive: true, force: true }));

  const { OpenControlRuntime } = await module();
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.putAdapterEndpoint({
    contractVersion: '1.0.0', id: 'adapter.browser.webdriver', name: 'Synthetic browser',
    adapterKind: 'browser-control', protocol: 'webdriver-http-v1',
    transport: { kind: 'http', url: fixture.url, timeoutMs: 2000 }
  });

  const created = await runtime.executeAdapter('adapter.browser.webdriver', execution('request.browser.session', {
    action: 'newSession', capabilities: { alwaysMatch: { browserName: 'synthetic' } }
  }));
  assert.equal(created.status, 'succeeded');
  assert.equal(created.output.sessionId, 'session-1');

  await runtime.executeAdapter('adapter.browser.webdriver', execution('request.browser.navigate', {
    action: 'navigate', sessionId: 'session-1', url: 'https://example.test/'
  }));
  const nav = fixture.requests.find(item => item.url === '/session/session-1/url');
  assert.deepEqual(nav.body, { url: 'https://example.test/' });

  const title = await runtime.executeAdapter('adapter.browser.webdriver', execution('request.browser.title', {
    action: 'title', sessionId: 'session-1'
  }));
  assert.equal(title.output, 'Synthetic title');

  const found = await runtime.executeAdapter('adapter.browser.webdriver', execution('request.browser.find', {
    action: 'findElement', sessionId: 'session-1', using: 'css selector', value: '#submit'
  }));
  const elementId = found.output['element-6066-11e4-a52e-4f735466cecf'];
  assert.equal(elementId, 'element-1');

  const clicked = await runtime.executeAdapter('adapter.browser.webdriver', execution('request.browser.click', {
    action: 'click', sessionId: 'session-1', elementId
  }));
  assert.equal(clicked.status, 'succeeded');
});

test('webdriver discovery registers a browser-control capability', async t => {
  const fixture = await startWebDriverFixture();
  t.after(() => fixture.server.close());
  const home = await mkdtemp(join(tmpdir(), 'q1x-webdriver-discover-'));
  t.after(() => rm(home, { recursive: true, force: true }));

  const { OpenControlRuntime } = await module();
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  runtime.putAdapterEndpoint({
    contractVersion: '1.0.0', id: 'adapter.browser.discover', name: 'Synthetic browser',
    adapterKind: 'browser-control', protocol: 'webdriver-http-v1',
    transport: { kind: 'http', url: fixture.url }
  });

  const capabilities = await runtime.discoverAdapterCapabilities('adapter.browser.discover');
  assert.equal(capabilities.length, 1);
  assert.equal(capabilities[0].adapterKind, 'browser-control');
  assert.equal(capabilities[0].availability.state, 'available');
  assert.equal(runtime.getCapability(capabilities[0].id).adapterKind, 'browser-control');
});
