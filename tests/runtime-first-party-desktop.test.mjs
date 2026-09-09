import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  createFirstPartyDesktopEndpoint,
  getFirstPartyDesktopBridge,
} from '../packages/runtime/dist/first-party-desktop.js';

const expected = {
  darwin: { platform: 'macos', command: 'q1x-desktop-bridge-macos' },
  win32: { platform: 'windows', command: 'q1x-desktop-bridge-windows' },
  linux: { platform: 'linux', command: 'q1x-desktop-bridge-linux' },
};

test('first-party desktop resolver maps only supported host operating systems', () => {
  for (const [platform, value] of Object.entries(expected)) {
    const resolved = getFirstPartyDesktopBridge(platform);
    assert.equal(resolved.platform, value.platform);
    assert.equal(resolved.command, value.command);
    assert.ok(resolved.supportedActions.length >= 20);
  }
  assert.throws(() => getFirstPartyDesktopBridge('aix'), /unsupported/i);
});

test('first-party desktop endpoint is a complete stdio endpoint without user-supplied bridge paths', () => {
  const endpoint = createFirstPartyDesktopEndpoint({ platform: 'linux', id: 'desktop.local' });
  assert.equal(endpoint.contractVersion, '1.0.0');
  assert.equal(endpoint.id, 'desktop.local');
  assert.equal(endpoint.backend, 'stdio-bridge');
  assert.equal(endpoint.platform, 'linux');
  assert.equal(endpoint.executionLocation, 'local');
  assert.equal(endpoint.transport?.command, 'q1x-desktop-bridge-linux');
  assert.deepEqual(endpoint.transport?.args, []);
  assert.ok(endpoint.supportedActions.includes('inspect'));
  assert.ok(endpoint.supportedActions.includes('screenshot'));
});

test('CLI setup-first-party persists the current-platform endpoint without endpoint JSON', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-first-party-desktop-'));
  try {
    const cli = new URL('../packages/runtime/dist/cli.js', import.meta.url);
    const setup = spawnSync(process.execPath, [cli.pathname, '--home', home, 'desktop', 'setup-first-party', '--id', 'desktop.local'], { encoding: 'utf8' });
    assert.equal(setup.status, 0, setup.stderr);
    const endpoint = JSON.parse(setup.stdout);
    assert.equal(endpoint.id, 'desktop.local');
    assert.equal(endpoint.backend, 'stdio-bridge');
    assert.equal(typeof endpoint.transport?.command, 'string');
    assert.ok(endpoint.transport.command.startsWith('q1x-desktop-bridge-'));

    const get = spawnSync(process.execPath, [cli.pathname, '--home', home, 'desktop-endpoints', 'get', 'desktop.local'], { encoding: 'utf8' });
    assert.equal(get.status, 0, get.stderr);
    assert.deepEqual(JSON.parse(get.stdout), endpoint);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
