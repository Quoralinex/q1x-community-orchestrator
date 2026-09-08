import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADAPTER_SDK_VERSION,
  AdapterSdkError,
  assertCommunityAdapter,
  createAdapterCompatibility,
  defineCommunityAdapter,
  runAdapterConformance,
  validateCommunityAdapter,
} from '../packages/adapter-sdk/dist/index.js';

function endpoint() {
  return {
    contractVersion: '1.0.0',
    id: 'adapter.community.echo',
    name: 'Community echo',
    adapterKind: 'cli-tui',
    protocol: 'community.echo',
    transport: {
      kind: 'stdio',
      command: 'node',
      args: ['echo.mjs'],
      inputMode: 'json',
      outputMode: 'json',
    },
  };
}

function request() {
  return {
    contractVersion: '1.0.0',
    id: 'execution.community.echo',
    workItemId: 'task.community.echo',
    requirements: {
      operations: ['community.echo'],
      adapterKinds: ['cli-tui'],
      inputModalities: ['text'],
      outputModalities: ['text'],
      localOnly: true,
      minimumTrust: 'validated',
    },
    input: { text: 'hello' },
    contextRefs: [],
    policy: {
      timeoutSeconds: 30,
      maxAttempts: 1,
      maxCost: 0,
      currency: 'USD',
      privacy: 'local',
    },
    createdAt: '2026-09-08T15:00:00Z',
  };
}

function validAdapter(overrides = {}) {
  return {
    protocol: 'community.echo',
    compatibility: createAdapterCompatibility(),
    async execute(_endpoint, executionRequest) {
      return {
        contractVersion: '1.0.0',
        id: 'result.echo',
        requestId: executionRequest.id,
        workItemId: executionRequest.workItemId,
        status: 'succeeded',
        output: executionRequest.input,
        startedAt: executionRequest.createdAt,
        finishedAt: executionRequest.createdAt,
      };
    },
    ...overrides,
  };
}

test('community adapter SDK exposes the exact alpha compatibility tuple', () => {
  assert.equal(ADAPTER_SDK_VERSION, '0.1.0-alpha.1');
  assert.deepEqual(createAdapterCompatibility(), {
    sdkVersion: '0.1.0-alpha.1',
    contractVersion: '1.0.0',
    runtimeRange: '0.1.x',
  });
});

test('valid community adapter is accepted and define returns the same object', () => {
  const adapter = validAdapter();
  assert.deepEqual(validateCommunityAdapter(adapter), { ok: true, issues: [] });
  assert.equal(defineCommunityAdapter(adapter), adapter);
  assert.doesNotThrow(() => assertCommunityAdapter(adapter));
});

test('invalid and overlong protocols are rejected', () => {
  for (const protocol of ['', 'Community Echo', 'community_echo', `a${'b'.repeat(64)}`]) {
    const result = validateCommunityAdapter(validAdapter({ protocol }));
    assert.equal(result.ok, false, protocol);
    assert.ok(result.issues.some(issue => issue.field === 'protocol'));
  }
});

test('missing execute is rejected', () => {
  const adapter = validAdapter();
  delete adapter.execute;
  const result = validateCommunityAdapter(adapter);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(issue => issue.field === 'execute'));
});

test('SDK, contract and runtime compatibility drift are rejected', () => {
  for (const compatibility of [
    { sdkVersion: '0.1.0-alpha.2', contractVersion: '1.0.0', runtimeRange: '0.1.x' },
    { sdkVersion: '0.1.0-alpha.1', contractVersion: '2.0.0', runtimeRange: '0.1.x' },
    { sdkVersion: '0.1.0-alpha.1', contractVersion: '1.0.0', runtimeRange: '^0.1.0' },
  ]) {
    const result = validateCommunityAdapter(validAdapter({ compatibility }));
    assert.equal(result.ok, false);
    assert.ok(result.issues.some(issue => issue.field.startsWith('compatibility.')));
  }
});

test('assertCommunityAdapter throws package-owned error for invalid metadata', () => {
  assert.throws(
    () => assertCommunityAdapter(validAdapter({ protocol: 'INVALID' })),
    error => error instanceof AdapterSdkError && error.code === 'INVALID_ADAPTER',
  );
});

test('conformance suite accepts a deterministic adapter and propagates the supplied signal', async () => {
  const controller = new AbortController();
  let observedSignal;
  const adapter = validAdapter({
    async execute(_endpoint, executionRequest, context) {
      observedSignal = context?.signal;
      return {
        contractVersion: '1.0.0',
        id: 'result.conformance',
        requestId: executionRequest.id,
        workItemId: executionRequest.workItemId,
        status: 'succeeded',
        output: executionRequest.input,
        startedAt: executionRequest.createdAt,
        finishedAt: executionRequest.createdAt,
      };
    },
    async discover() {
      return [{
        contractVersion: '1.0.0',
        id: 'capability.community.echo',
        name: 'Community echo',
        description: 'Echoes deterministic local input.',
        operations: ['community.echo'],
        adapterKinds: ['cli-tui'],
        inputModalities: ['text'],
        outputModalities: ['text'],
        trust: 'validated',
        locality: 'local',
      }];
    },
  });

  const report = await runAdapterConformance(adapter, {
    endpoint: endpoint(),
    request: request(),
    signal: controller.signal,
  });

  assert.equal(report.ok, true);
  assert.equal(report.protocol, 'community.echo');
  assert.ok(report.checks.every(check => check.ok));
  assert.equal(observedSignal, controller.signal);
});

test('conformance suite rejects invalid execution results and discovery values', async () => {
  const badResult = await runAdapterConformance(validAdapter({
    async execute(_endpoint, executionRequest) {
      return {
        contractVersion: '2.0.0',
        id: 'result.bad',
        requestId: executionRequest.id,
        workItemId: executionRequest.workItemId,
        status: 'succeeded',
        startedAt: executionRequest.createdAt,
        finishedAt: executionRequest.createdAt,
      };
    },
  }), { endpoint: endpoint(), request: request() });
  assert.equal(badResult.ok, false);
  assert.ok(badResult.checks.some(check => check.name === 'execute-result' && !check.ok));

  const badDiscovery = await runAdapterConformance(validAdapter({
    async discover() { return { arbitrary: true }; },
  }), { endpoint: endpoint(), request: request() });
  assert.equal(badDiscovery.ok, false);
  assert.ok(badDiscovery.checks.some(check => check.name === 'discover-result' && !check.ok));
});

test('conformance suite detects mutation of endpoint or request fixtures', async () => {
  const mutating = validAdapter({
    async execute(adapterEndpoint, executionRequest) {
      adapterEndpoint.name = 'mutated';
      executionRequest.input.text = 'mutated';
      return {
        contractVersion: '1.0.0',
        id: 'result.mutating',
        requestId: executionRequest.id,
        workItemId: executionRequest.workItemId,
        status: 'succeeded',
        startedAt: executionRequest.createdAt,
        finishedAt: executionRequest.createdAt,
      };
    },
  });

  const report = await runAdapterConformance(mutating, { endpoint: endpoint(), request: request() });
  assert.equal(report.ok, false);
  assert.ok(report.checks.some(check => check.name === 'fixture-immutability' && !check.ok));
});
