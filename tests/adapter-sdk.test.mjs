import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADAPTER_SDK_VERSION,
  AdapterSdkError,
  assertCommunityAdapter,
  createAdapterCompatibility,
  defineCommunityAdapter,
  validateCommunityAdapter,
} from '../packages/adapter-sdk/dist/index.js';

function validAdapter(overrides = {}) {
  return {
    protocol: 'community.echo',
    compatibility: createAdapterCompatibility(),
    async execute(_endpoint, request) {
      return {
        contractVersion: '1.0.0',
        id: 'result.echo',
        requestId: request.id,
        workItemId: request.workItemId,
        status: 'succeeded',
        output: request.input,
        startedAt: request.createdAt,
        finishedAt: request.createdAt,
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
