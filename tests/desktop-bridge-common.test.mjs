import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BRIDGE_PROTOCOL,
  MAX_BRIDGE_BYTES,
  validateBridgeEnvelope,
  createBridgeFailure,
  createBridgeSuccess,
} from '../packages/desktop-bridge-common/dist/index.js';

function envelope(overrides = {}) {
  return {
    protocol: 'q1x-desktop-bridge/1',
    endpoint: {
      id: 'desktop.test',
      platform: 'any',
    },
    batch: {
      contractVersion: '1.0.0',
      id: 'desktop.batch.test',
      actions: [
        { id: 'wait', kind: 'wait', milliseconds: 1 },
      ],
    },
    ...overrides,
  };
}

test('desktop bridge common exposes the exact protocol and byte ceiling', () => {
  assert.equal(BRIDGE_PROTOCOL, 'q1x-desktop-bridge/1');
  assert.equal(MAX_BRIDGE_BYTES, 4 * 1024 * 1024);
});

test('valid desktop bridge envelope is accepted without mutation', () => {
  const input = envelope();
  const snapshot = structuredClone(input);
  const result = validateBridgeEnvelope(input);
  assert.equal(result.ok, true);
  assert.equal(result.value, input);
  assert.deepEqual(input, snapshot);
});

test('invalid protocol and malformed action shapes fail closed', () => {
  const wrongProtocol = validateBridgeEnvelope(envelope({ protocol: 'q1x-desktop-bridge/2' }));
  assert.equal(wrongProtocol.ok, false);
  assert.equal(wrongProtocol.code, 'INVALID_BRIDGE_ENVELOPE');

  const malformed = envelope();
  malformed.batch.actions = [{ id: 'click' }];
  const badAction = validateBridgeEnvelope(malformed);
  assert.equal(badAction.ok, false);
  assert.equal(badAction.code, 'INVALID_BRIDGE_ENVELOPE');
});

test('normalized success output preserves ordered action correlation', () => {
  const result = createBridgeSuccess({
    contractVersion: '1.0.0',
    id: 'desktop.result.test',
    batchId: 'desktop.batch.test',
    status: 'succeeded',
    actions: [
      { id: 'wait', status: 'succeeded', durationMs: 1 },
    ],
    startedAt: '2026-09-09T00:00:00Z',
    finishedAt: '2026-09-09T00:00:00Z',
  });
  assert.deepEqual(result, {
    ok: true,
    result: {
      contractVersion: '1.0.0',
      id: 'desktop.result.test',
      batchId: 'desktop.batch.test',
      status: 'succeeded',
      actions: [{ id: 'wait', status: 'succeeded', durationMs: 1 }],
      startedAt: '2026-09-09T00:00:00Z',
      finishedAt: '2026-09-09T00:00:00Z',
    },
  });
});

test('normalized failure output is metadata-only and bounded in shape', () => {
  const failure = createBridgeFailure('PERMISSION_DENIED', 'Accessibility permission is required', {
    remediation: 'Grant Accessibility permission to the Q1X bridge process.',
  });
  assert.deepEqual(failure, {
    ok: false,
    error: {
      code: 'PERMISSION_DENIED',
      message: 'Accessibility permission is required',
      details: {
        remediation: 'Grant Accessibility permission to the Q1X bridge process.',
      },
    },
  });
  assert.equal(JSON.stringify(failure).includes('secret'), false);
});
