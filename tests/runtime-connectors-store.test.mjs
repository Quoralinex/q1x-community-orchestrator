import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  configureConnector,
  getConfiguredConnector,
  listConfiguredConnectors,
  setConnectorEnabled,
} from '../packages/runtime/dist/connectors/configuration.js';
import { OpenControlRuntime } from '../packages/runtime/dist/runtime.js';

test('connector configuration persists in local runtime state and survives reopen', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-connectors-store-'));
  try {
    const configured = configureConnector(home, {
      id: 'desktop.linux.first-party',
      profile: 'desktop-first-party',
      parameters: { outputDir: './desktop-output' },
      environmentKeys: {},
      enabled: true,
    });
    assert.equal(configured.id, 'desktop.linux.first-party');
    assert.equal(configured.enabled, true);
    assert.match(configured.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

    const runtime = OpenControlRuntime.open({ home });
    runtime.close();

    assert.deepEqual(getConfiguredConnector(home, configured.id), configured);
    assert.deepEqual(listConfiguredConnectors(home), [configured]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('connector configuration rejects unknown connector ids and secret-bearing state', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-connectors-secrets-'));
  try {
    assert.throws(() => configureConnector(home, {
      id: 'unknown.connector', profile: 'x', parameters: {}, environmentKeys: {}, enabled: true,
    }), /unknown connector/i);

    assert.throws(() => configureConnector(home, {
      id: 'desktop.linux.first-party',
      profile: 'desktop-first-party',
      parameters: { apiKey: 'should-not-be-here' },
      environmentKeys: {},
      enabled: true,
    }), /secret|credential/i);

    assert.throws(() => configureConnector(home, {
      id: 'desktop.linux.first-party',
      profile: 'desktop-first-party',
      parameters: {},
      environmentKeys: { credential: 'not a valid env name with spaces' },
      enabled: true,
    }), /environment/i);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('enable and disable update only connector state', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-connectors-enable-'));
  try {
    const original = configureConnector(home, {
      id: 'desktop.linux.first-party',
      profile: 'desktop-first-party',
      parameters: { outputDir: './desktop-output' },
      environmentKeys: {},
      enabled: false,
    });
    const enabled = setConnectorEnabled(home, original.id, true);
    assert.equal(enabled.enabled, true);
    assert.deepEqual(enabled.parameters, original.parameters);
    assert.deepEqual(enabled.environmentKeys, original.environmentKeys);
    assert.notEqual(enabled.updatedAt, undefined);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
