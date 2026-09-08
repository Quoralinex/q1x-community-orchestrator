import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';

import { createAdapterCompatibility } from '../packages/adapter-sdk/dist/index.js';
import { OpenControlRuntime, communityAdapterTransport } from '../packages/runtime/dist/index.js';

const request = {
  contractVersion: '1.0.0',
  id: 'exec-community-1',
  workItemId: 'work-community-1',
  requirements: { operations: ['community.echo'], adapterKinds: ['cli-tui'] },
  input: { value: 'hello-community' },
  createdAt: '2026-09-08T16:00:00.000Z',
};

function echoAdapter() {
  return {
    protocol: 'community.echo',
    compatibility: createAdapterCompatibility(),
    async execute(_endpoint, executionRequest, context) {
      return {
        contractVersion: '1.0.0',
        id: 'result.community.echo',
        requestId: executionRequest.id,
        workItemId: executionRequest.workItemId,
        status: context?.signal?.aborted ? 'cancelled' : 'succeeded',
        output: executionRequest.input,
        startedAt: executionRequest.createdAt,
        finishedAt: executionRequest.createdAt,
      };
    },
    async discover() {
      return [{
        contractVersion: '1.0.0',
        id: 'capability.community.echo.runtime',
        name: 'Community echo runtime adapter',
        adapterKind: 'cli-tui',
        operations: ['community.echo'],
        modalities: { input: ['structured-data'], output: ['structured-data'] },
        availability: { state: 'available', checkedAt: '2026-09-08T16:00:00.000Z' },
        cost: { class: 'free' },
        privacy: { executionLocation: 'local', dataRetention: 'none' },
        trust: { level: 'validated', source: 'community-adapter-test' },
        platforms: ['linux', 'macos', 'windows'],
      }];
    },
  };
}

test('runtime explicitly injects a conforming community adapter without replacing built-in transports', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-community-adapter-runtime-'));
  const runtime = OpenControlRuntime.open({
    home,
    adapterTransports: [communityAdapterTransport(echoAdapter())],
  });
  try {
    runtime.putAdapterEndpoint({
      contractVersion: '1.0.0',
      id: 'community-echo',
      name: 'Community echo',
      adapterKind: 'cli-tui',
      protocol: 'community.echo',
      transport: { kind: 'stdio', command: process.execPath, inputMode: 'json', outputMode: 'json' },
    });

    const result = await runtime.executeAdapter('community-echo', request);
    assert.equal(result.status, 'succeeded');
    assert.deepEqual(result.output, request.input);

    const capabilities = await runtime.discoverAdapterCapabilities('community-echo');
    assert.equal(capabilities.length, 1);
    assert.equal(capabilities[0].id, 'capability.community.echo.runtime');
    assert.equal(runtime.getCapability(capabilities[0].id)?.trust.level, 'validated');

    runtime.putAdapterEndpoint({
      contractVersion: '1.0.0',
      id: 'builtin-cli-echo',
      name: 'Built-in CLI echo',
      adapterKind: 'cli-tui',
      protocol: 'cli-json-stdio',
      transport: {
        kind: 'stdio',
        command: process.execPath,
        args: ['-e', 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(s))'],
        inputMode: 'json',
        outputMode: 'json',
        timeoutMs: 5000,
      },
    });
    const builtin = await runtime.executeAdapter('builtin-cli-echo', { ...request, id: 'exec-builtin-1' });
    assert.equal(builtin.status, 'succeeded');
    assert.deepEqual(builtin.output, request.input);
  } finally {
    runtime.close();
    await rm(home, { recursive: true, force: true });
  }
});
