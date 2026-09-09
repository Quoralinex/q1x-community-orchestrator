import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function runCli(home, ...args) {
  const cli = new URL('../packages/runtime/dist/cli.js', import.meta.url);
  return spawnSync(process.execPath, [cli.pathname, '--home', home, ...args], { encoding: 'utf8' });
}

test('connectors apply persists an enabled configured model endpoint without endpoint JSON', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-connectors-apply-cli-'));
  try {
    const add = runCli(home, 'connectors', 'add', 'model.openai-chat.local');
    assert.equal(add.status, 0, add.stderr);
    const configure = runCli(
      home, 'connectors', 'configure', 'model.openai-chat.local',
      '--parameter', 'url=http://127.0.0.1:1234/v1/chat/completions',
      '--parameter', 'model=local-model',
    );
    assert.equal(configure.status, 0, configure.stderr);
    const enable = runCli(home, 'connectors', 'enable', 'model.openai-chat.local');
    assert.equal(enable.status, 0, enable.stderr);

    const apply = runCli(home, 'connectors', 'apply', 'model.openai-chat.local');
    assert.equal(apply.status, 0, apply.stderr);
    const applied = JSON.parse(apply.stdout);
    assert.equal(applied.connectorId, 'model.openai-chat.local');
    assert.equal(applied.category, 'model');
    assert.equal(applied.endpointId, 'endpoint.model.openai-chat.local');

    const get = runCli(home, 'endpoints', 'get', applied.endpointId);
    assert.equal(get.status, 0, get.stderr);
    const endpoint = JSON.parse(get.stdout);
    assert.equal(endpoint.protocol, 'openai-chat-completions');
    assert.equal(endpoint.defaultModel, 'local-model');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('connectors apply refuses a configured connector until it is enabled', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-connectors-apply-disabled-'));
  try {
    assert.equal(runCli(home, 'connectors', 'add', 'model.openai-chat.local').status, 0);
    assert.equal(runCli(
      home, 'connectors', 'configure', 'model.openai-chat.local',
      '--parameter', 'url=http://127.0.0.1:1234/v1/chat/completions',
      '--parameter', 'model=local-model',
    ).status, 0);
    const apply = runCli(home, 'connectors', 'apply', 'model.openai-chat.local');
    assert.notEqual(apply.status, 0);
    assert.match(apply.stderr, /disabled|enable/i);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
