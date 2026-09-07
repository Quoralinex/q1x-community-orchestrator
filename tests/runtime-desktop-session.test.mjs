import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DesktopBackendRegistry,
  DesktopSessionManager,
  RuntimeError
} from '../packages/runtime/dist/index.js';

const endpoint = {
  contractVersion: '1.0.0', id: 'desktop.test', name: 'Desktop',
  backend: 'memory', platforms: ['macos'],
  allowedApplications: [{
    id: 'app.notes', name: 'Notes',
    selectors: [{ platform: 'macos', kind: 'application-name', value: 'Notes' }]
  }]
};

const batch = {
  contractVersion: '1.0.0', id: 'desktop.batch.test',
  actions: [{ id: 'inspect', kind: 'inspect', applicationId: 'app.notes' }]
};
function memoryBackend() {
  return {
    id: 'memory',
    async probe() {
      return { available: true, platform: 'macos', operations: ['inspect'] };
    },
    async open(value) {
      return { endpointId: value.id, closed: false, async close() { this.closed = true; } };
    },
    async execute(_session, value) {
      return {
        contractVersion: '1.0.0', id: `${value.id}.result`, batchId: value.id,
        status: 'succeeded',
        actions: value.actions.map(action => ({ id: action.id, status: 'succeeded', durationMs: 1 }))
      };
    }
  };
}

test('desktop backend registry rejects duplicate ids and resolves probes', async () => {
  const backend = memoryBackend();
  const registry = new DesktopBackendRegistry([backend]);
  assert.equal(registry.get('memory'), backend);
  assert.deepEqual(registry.ids(), ['memory']);
  await assert.rejects(async () => registry.register(memoryBackend()),
    error => error instanceof RuntimeError && error.code === 'CONFLICT');
  assert.equal((await registry.probe('memory')).available, true);
});
test('desktop sessions are isolated and execute through their registered backend', async () => {
  const manager = new DesktopSessionManager(new DesktopBackendRegistry([memoryBackend()]));
  const first = await manager.openSession(endpoint);
  const second = await manager.openSession(endpoint);
  assert.notEqual(first.id, second.id);
  assert.equal(manager.count(), 2);
  assert.equal(manager.getSession(first.id)?.endpointId, endpoint.id);

  const result = await manager.execute(first.id, batch);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.actions[0].id, 'inspect');

  await manager.closeSession(first.id);
  assert.equal(manager.count(), 1);
  await assert.rejects(async () => manager.execute(first.id, batch),
    error => error instanceof RuntimeError && error.code === 'NOT_FOUND');
  await manager.closeAll();
  assert.equal(manager.count(), 0);
});

test('desktop session manager reports missing backends honestly', async () => {
  const manager = new DesktopSessionManager(new DesktopBackendRegistry());
  await assert.rejects(async () => manager.openSession(endpoint),
    error => error instanceof RuntimeError && error.code === 'TRANSPORT_NOT_FOUND');
});
