import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const cli = join(root, 'packages/runtime/dist/cli.js');
const bridge = resolve('tests/fixtures/desktop-bridge.mjs');

function run(home, env, ...args) {
  return new Promise(resolveResult => {
    const child = spawn(process.execPath, [cli, '--home', home, ...args], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => stdout += data);
    child.stderr.on('data', data => stderr += data);
    child.on('close', status => resolveResult({ status, stdout, stderr }));
  });
}
function success(result) { assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); }

test('q1x CLI persists, discovers and executes a desktop endpoint', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-cli-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const endpointPath = join(home, 'desktop-endpoint.json');
  const batchPath = join(home, 'desktop-batch.json');
  await writeFile(endpointPath, JSON.stringify({
    contractVersion: '1.0.0', id: 'desktop.cli', name: 'CLI desktop', backend: 'stdio-bridge', platform: 'any', executionLocation: 'local', supportedActions: ['focus-application'],
    transport: { command: process.execPath, args: [bridge], timeoutMs: 1000, environment: [{ name: 'Q1X_BRIDGE_TEST', environmentKey: 'Q1X_TEST_MAPPED' }] },
    applicationPolicy: { allowedApplications: ['example.app'] }, outputDir: join(home, 'output')
  }));
  await writeFile(batchPath, JSON.stringify({
    contractVersion: '1.0.0', id: 'desktop.batch.cli',
    actions: [{ id: 'focus', kind: 'focus-application', application: 'example.app' }]
  }));
  const env = { Q1X_TEST_MAPPED: 'cli-mapped' };
  assert.equal(success(await run(home, env, 'desktop-endpoints', 'put', '--file', endpointPath)).id, 'desktop.cli');
  assert.equal(success(await run(home, env, 'desktop-endpoints', 'list')).length, 1);
  assert.equal(success(await run(home, env, 'desktop-endpoints', 'get', 'desktop.cli')).backend, 'stdio-bridge');
  const capability = success(await run(home, env, 'desktop', 'discover', 'desktop.cli'));
  assert.equal(capability.adapterKind, 'desktop-control');
  assert.equal(capability.availability.state, 'available');
  const result = success(await run(home, env, 'desktop', 'run', 'desktop.cli', '--file', batchPath));
  assert.equal(result.status, 'succeeded');
  assert.equal(result.actions[0].output.mappedEnvironment, 'cli-mapped');
});
