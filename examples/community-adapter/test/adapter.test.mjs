import assert from 'node:assert/strict';
import test from 'node:test';

import { runAdapterConformance } from '@quoralinex/q1x-community-adapter-sdk';
import { communityEchoAdapter } from '../dist/index.js';

const endpoint = {
  contractVersion: '1.0.0',
  id: 'adapter.community.echo.reference',
  name: 'Community echo reference adapter',
  adapterKind: 'cli-tui',
  protocol: 'community.echo',
  transport: { kind: 'stdio', command: 'node', inputMode: 'json', outputMode: 'json' },
};

const request = {
  contractVersion: '1.0.0',
  id: 'execution.community.echo.reference',
  workItemId: 'task.community.echo.reference',
  requirements: { operations: ['community.echo'], adapterKinds: ['cli-tui'] },
  input: { text: 'reference-echo' },
  createdAt: '2026-09-08T16:00:00.000Z',
};

test('community echo reference adapter passes public conformance', async () => {
  const report = await runAdapterConformance(communityEchoAdapter, { endpoint, request });
  assert.equal(report.ok, true, JSON.stringify(report));
});
