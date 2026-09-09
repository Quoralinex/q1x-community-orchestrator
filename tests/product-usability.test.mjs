import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const cli = join(root, 'packages/runtime/dist/cli.js');

function runCli(home, ...args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cli, '--home', home, ...args], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('close', status => resolve({ status, stdout, stderr }));
  });
}

function success(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function startFixture(relativePath) {
  const child = spawn(process.execPath, [relativePath], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const metadata = await new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error(`Fixture ${relativePath} did not announce readiness: ${stderr}`)), 5000);
    child.stdout.on('data', chunk => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(buffer.slice(0, newline)));
      } catch (error) {
        reject(new Error(`Fixture ${relativePath} emitted invalid startup metadata: ${error.message}`));
      }
    });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Fixture ${relativePath} exited before readiness with ${code}: ${stderr}`));
    });
  });
  return {
    child,
    metadata,
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    },
  };
}

test('product user configures and invokes a local model through connector CLI without endpoint JSON', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-product-model-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const fixture = await startFixture('tests/fixtures/product-usability/model-server.mjs');
  t.after(() => fixture.close());

  const listed = success(await runCli(home, 'connectors', 'list'));
  assert.ok(listed.some(connector => connector.id === 'model.openai-chat.local'));

  success(await runCli(home, 'connectors', 'add', 'model.openai-chat.local'));
  success(await runCli(
    home,
    'connectors', 'configure', 'model.openai-chat.local',
    '--parameter', `url=${fixture.metadata.chatUrl}`,
    '--parameter', 'model=phase12-fixture',
  ));
  success(await runCli(home, 'connectors', 'enable', 'model.openai-chat.local'));
  const preflight = success(await runCli(home, 'connectors', 'test', 'model.openai-chat.local'));
  assert.notEqual(preflight.state, 'blocked');
  const applied = success(await runCli(home, 'connectors', 'apply', 'model.openai-chat.local'));
  assert.equal(applied.endpointId, 'endpoint.model.openai-chat.local');

  const requestPath = join(home, 'model-request.json');
  await writeFile(requestPath, JSON.stringify({
    contractVersion: '1.0.0',
    id: 'model.request.phase12.product',
    endpointId: applied.endpointId,
    messages: [{ role: 'user', content: 'phase12-product-model' }],
    createdAt: '2026-09-09T17:30:00.000Z',
  }));
  const response = success(await runCli(home, 'model', 'invoke', '--file', requestPath));
  assert.equal(response.outputText, 'phase12-product-model-ok');
});
