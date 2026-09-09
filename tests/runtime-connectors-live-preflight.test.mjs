import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { configureConnector } from '../packages/runtime/dist/connectors/configuration.js';
import { runConnectorPreflight } from '../packages/runtime/dist/connectors/preflight.js';

test('model connector preflight records live endpoint reachability without invoking a model', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-preflight-live-model-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const server = createServer((_request, response) => {
    response.statusCode = 405;
    response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();

  configureConnector(home, {
    id: 'model.openai-chat.local',
    profile: 'model-openai-chat-local',
    parameters: { url: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: 'phase12-fixture' },
    environmentKeys: {},
    enabled: true,
  });

  const report = await runConnectorPreflight(home, 'model.openai-chat.local');
  const live = report.checks.find(check => check.id === 'live:model');
  assert.equal(live?.state, 'ok');
  assert.match(live?.message ?? '', /reachable/i);
});
