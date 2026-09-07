import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const service = join(root, 'packages/runtime/dist/service.js');

async function freePort() {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('No port'));
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

test('local service exposes health/readiness and shuts down on termination', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-health-service-'));
  const port = await freePort();
  const child = spawn(process.execPath, [service], {
    env: { ...process.env, Q1X_HOME: home, Q1X_HOST: '127.0.0.1', Q1X_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await rm(home, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10000;
  let ready;
  while (Date.now() < deadline) {
    try { ready = await fetch(`${base}/readyz`); if (ready.ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(ready?.status, 200);
  assert.deepEqual(await ready.json(), { status: 'ready' });
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const missing = await fetch(`${base}/missing`);
  assert.equal(missing.status, 404);

  child.kill('SIGTERM');
  const exit = await new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  if (process.platform === 'win32') {
    assert.ok(exit.code === 0 || exit.signal === 'SIGTERM', `unexpected Windows termination: ${JSON.stringify(exit)}`);
  } else {
    assert.deepEqual(exit, { code: 0, signal: null });
  }
});
