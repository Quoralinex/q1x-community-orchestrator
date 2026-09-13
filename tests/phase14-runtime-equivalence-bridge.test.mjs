import assert from 'node:assert/strict';
import test from 'node:test';
import * as completion from '../scripts/phase14/verify-completion.mjs';

const SOAK_SHA = 'fa604e123960d32e66317d91cb909e82bc4fbd72';
const UPGRADE_SHA = '35ecac7850b214592de537e46d46a2677591b090';
const MAINLINE_ANCHOR_SHA = 'f960d1dd5adc036c21a344067b7c9c0c2fb619b3';
const CURRENT_SHA = 'f86df8d6bd10e25e2998d0dfb7e8b1697b50fe78';

const retained = {
  schema: 'q1x.phase14-runtime-equivalence.v1',
  fromSha: SOAK_SHA,
  toSha: UPGRADE_SHA,
  equivalent: true,
  changedPaths: ['tests/phase14-completion.test.mjs'],
  invalidatingPaths: [],
  neutralizedPaths: [],
};

const bridge = {
  schema: 'q1x.phase14-runtime-equivalence-mainline-bridge.v1',
  fromSha: UPGRADE_SHA,
  toSha: MAINLINE_ANCHOR_SHA,
  equivalent: true,
  invalidatingPaths: [],
};

const tail = {
  schema: 'q1x.phase14-runtime-equivalence.v1',
  fromSha: MAINLINE_ANCHOR_SHA,
  toSha: CURRENT_SHA,
  equivalent: true,
  changedPaths: ['docs/roadmap.md'],
  invalidatingPaths: [],
  neutralizedPaths: [],
};

function compose(args) {
  assert.equal(typeof completion.composeRuntimeEquivalenceFallback, 'function');
  return completion.composeRuntimeEquivalenceFallback(args);
}

test('retained acceptance evidence can bridge through the permanent Phase 14 mainline anchor', () => {
  const result = compose({
    fromSha: SOAK_SHA,
    toSha: CURRENT_SHA,
    retainedRuntimeEquivalence: retained,
    mainlineBridge: bridge,
    tailRuntimeEquivalence: tail,
  });
  assert.equal(result.equivalent, true);
  assert.equal(result.fromSha, SOAK_SHA);
  assert.equal(result.toSha, CURRENT_SHA);
  assert.equal(result.bridge.anchorSha, MAINLINE_ANCHOR_SHA);
  assert.equal(result.bridge.usedRetainedHop, true);
});

test('upgrade evidence can bridge directly to the permanent Phase 14 mainline anchor', () => {
  const result = compose({
    fromSha: UPGRADE_SHA,
    toSha: CURRENT_SHA,
    retainedRuntimeEquivalence: retained,
    mainlineBridge: bridge,
    tailRuntimeEquivalence: tail,
  });
  assert.equal(result.equivalent, true);
  assert.equal(result.bridge.usedRetainedHop, false);
});

test('missing Phase 14 mainline bridge fails closed', () => {
  assert.throws(() => compose({
    fromSha: UPGRADE_SHA,
    toSha: CURRENT_SHA,
    retainedRuntimeEquivalence: retained,
    mainlineBridge: undefined,
    tailRuntimeEquivalence: tail,
  }), /mainline bridge/i);
});

test('invalid Phase 14 mainline bridge fails closed', () => {
  assert.throws(() => compose({
    fromSha: UPGRADE_SHA,
    toSha: CURRENT_SHA,
    retainedRuntimeEquivalence: retained,
    mainlineBridge: { ...bridge, equivalent: false },
    tailRuntimeEquivalence: tail,
  }), /mainline bridge/i);
});
