import assert from 'node:assert/strict';
import test from 'node:test';

import { isCompletionWiringOnlyPackageChange } from '../scripts/phase14/runtime-equivalence.mjs';

const before = {
  name: 'q1x-community-orchestrator',
  scripts: {
    start: 'node packages/runtime/dist/service.js',
    test: 'node --test tests/schema-contracts.test.mjs',
    check: 'npm run build && npm run verify:phase14',
    'verify:phase14': 'node scripts/phase14/verify-completion.mjs',
  },
};

test('Phase 14 documentation regression wiring is runtime neutral', () => {
  const after = structuredClone(before);
  after.scripts.test += ' tests/phase14-docs.test.mjs';
  assert.equal(isCompletionWiringOnlyPackageChange(before, after), true);
});

test('runtime-affecting package script changes remain invalidating', () => {
  const after = structuredClone(before);
  after.scripts.start = 'node packages/runtime/dist/other-service.js';
  assert.equal(isCompletionWiringOnlyPackageChange(before, after), false);
});
