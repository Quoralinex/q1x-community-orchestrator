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

const implementedIds = [
  'desktop.linux.first-party',
  'desktop.macos.first-party',
  'desktop.windows.first-party',
  'mcp.stdio',
  'mcp.streamable-http',
  'model.anthropic-compatible.hosted',
  'model.anthropic-messages.local',
  'model.openai-chat.local',
  'model.openai-compatible.hosted',
  'model.openai-responses.local',
];

test('connectors list/show expose the deterministic built-in catalogue', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-connectors-cli-list-'));
  try {
    const list = runCli(home, 'connectors', 'list');
    assert.equal(list.status, 0, list.stderr);
    const catalogue = JSON.parse(list.stdout);
    assert.deepEqual(catalogue.map(item => item.id), implementedIds);

    const show = runCli(home, 'connectors', 'show', 'desktop.linux.first-party');
    assert.equal(show.status, 0, show.stderr);
    assert.equal(JSON.parse(show.stdout).profile.kind, 'desktop-first-party');

    const model = runCli(home, 'connectors', 'show', 'model.openai-chat.local');
    assert.equal(model.status, 0, model.stderr);
    assert.equal(JSON.parse(model.stdout).profile.kind, 'model-openai-chat-local');

    const mcp = runCli(home, 'connectors', 'show', 'mcp.stdio');
    assert.equal(mcp.status, 0, mcp.stderr);
    assert.equal(JSON.parse(mcp.stdout).profile.kind, 'mcp-stdio');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('connectors add/configure/enable/disable manage local non-secret state', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-connectors-cli-state-'));
  try {
    const add = runCli(home, 'connectors', 'add', 'desktop.linux.first-party');
    assert.equal(add.status, 0, add.stderr);
    assert.equal(JSON.parse(add.stdout).enabled, false);

    const configure = runCli(
      home,
      'connectors', 'configure', 'desktop.linux.first-party',
      '--parameter', 'outputDir=./desktop-output',
      '--environment', 'example=EXAMPLE_ENV',
    );
    assert.equal(configure.status, 0, configure.stderr);
    const configured = JSON.parse(configure.stdout);
    assert.deepEqual(configured.parameters, { outputDir: './desktop-output' });
    assert.deepEqual(configured.environmentKeys, { example: 'EXAMPLE_ENV' });

    const enable = runCli(home, 'connectors', 'enable', 'desktop.linux.first-party');
    assert.equal(enable.status, 0, enable.stderr);
    assert.equal(JSON.parse(enable.stdout).enabled, true);

    const disable = runCli(home, 'connectors', 'disable', 'desktop.linux.first-party');
    assert.equal(disable.status, 0, disable.stderr);
    assert.equal(JSON.parse(disable.stdout).enabled, false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('connectors CLI fails closed for unknown connectors and malformed key-value options', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-connectors-cli-errors-'));
  try {
    const unknown = runCli(home, 'connectors', 'add', 'unknown.connector');
    assert.notEqual(unknown.status, 0);
    assert.match(unknown.stderr, /Unknown connector/i);

    const malformed = runCli(home, 'connectors', 'configure', 'desktop.linux.first-party', '--parameter', 'missing-equals');
    assert.notEqual(malformed.status, 0);
    assert.match(malformed.stderr, /key=value/i);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
