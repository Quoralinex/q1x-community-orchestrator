import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function module() { return import('../packages/runtime/dist/index.js'); }

const cliEndpoint = {
  contractVersion: '1.0.0', id: 'adapter.cli.test', name: 'Portable CLI',
  adapterKind: 'cli-tui', protocol: 'cli-json-stdio',
  transport: { kind: 'stdio', command: 'node', args: ['worker.mjs'], inputMode: 'json', outputMode: 'json' }
};

const httpEndpoint = url => ({
  contractVersion: '1.0.0', id: 'adapter.a2a.test', name: 'Remote agent',
  adapterKind: 'a2a', protocol: 'a2a-jsonrpc', transport: { kind: 'http', url }
});

test('adapter endpoints persist across restart', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-adapter-endpoint-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime } = await module();
  let runtime = OpenControlRuntime.open({ home });  runtime.putAdapterEndpoint(cliEndpoint);
  runtime.close();
  runtime = OpenControlRuntime.open({ home });
  assert.equal(runtime.getAdapterEndpoint(cliEndpoint.id).protocol, 'cli-json-stdio');
  assert.equal(runtime.listAdapterEndpoints().length, 1);
  runtime.close();
});

test('adapter endpoint security rejects remote HTTP and static credentials', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-adapter-security-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime, RuntimeError } = await module();
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  assert.throws(() => runtime.putAdapterEndpoint(httpEndpoint('http://example.com/a2a')), error => {
    assert.equal(error instanceof RuntimeError, true); assert.equal(error.code, 'INSECURE_ENDPOINT'); return true;
  });
  assert.throws(() => runtime.putAdapterEndpoint({
    ...httpEndpoint('https://example.com/a2a'),
    transport: { kind: 'http', url: 'https://example.com/a2a', staticHeaders: { Authorization: 'secret' } }
  }), error => { assert.equal(error.code, 'INSECURE_ENDPOINT'); return true; });
});
test('adapter transport registry supports external protocols and rejects duplicates', async () => {
  const { AdapterTransportRegistry, RuntimeError } = await module();
  const registry = new AdapterTransportRegistry();
  registry.register({
    protocol: 'example-adapter',
    async execute(endpoint, request) {
      return { contractVersion: '1.0.0', id: 'result.external', requestId: request.id,
        workItemId: request.workItemId, status: 'succeeded', output: { endpointId: endpoint.id },
        startedAt: request.createdAt, finishedAt: request.createdAt };
    }
  });
  assert.deepEqual(registry.protocols(), ['example-adapter']);
  assert.throws(() => registry.register({ protocol: 'example-adapter', async execute() {} }), error => {
    assert.equal(error instanceof RuntimeError, true); assert.equal(error.code, 'CONFLICT'); return true;
  });
});
