import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { configureConnector } from '../packages/runtime/dist/connectors/configuration.js';
import { runConnectorPreflight } from '../packages/runtime/dist/connectors/preflight.js';

const healthyDoctor = async platform => ({
  protocol: 'q1x-desktop-bridge/1',
  platform,
  state: 'ok',
  checks: [{ id: 'native', state: 'ok', message: 'native automation available' }],
});

test('preflight reports not-configured before connector setup', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-preflight-unconfigured-'));
  try {
    const report = await runConnectorPreflight(home, 'desktop.linux.first-party', {
      platform: 'linux',
      commandExists: async () => true,
      desktopDoctor: healthyDoctor,
    });
    assert.equal(report.state, 'not-configured');
    assert.equal(report.checks.some(check => check.id === 'configuration' && check.state === 'not-configured'), true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('preflight reports disabled connector as warning without inventing readiness', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-preflight-disabled-'));
  try {
    configureConnector(home, {
      id: 'desktop.linux.first-party', profile: 'desktop-first-party', parameters: {}, environmentKeys: {}, enabled: false,
    });
    const report = await runConnectorPreflight(home, 'desktop.linux.first-party', {
      platform: 'linux', commandExists: async () => true, desktopDoctor: healthyDoctor,
    });
    assert.equal(report.state, 'warning');
    assert.equal(report.checks.some(check => check.id === 'enabled' && check.state === 'warning'), true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('preflight reports unsupported OS and missing commands fail-closed', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-preflight-platform-'));
  try {
    configureConnector(home, {
      id: 'desktop.linux.first-party', profile: 'desktop-first-party', parameters: {}, environmentKeys: {}, enabled: true,
    });
    const wrongOs = await runConnectorPreflight(home, 'desktop.linux.first-party', {
      platform: 'darwin', commandExists: async () => true, desktopDoctor: healthyDoctor,
    });
    assert.equal(wrongOs.state, 'unsupported');

    const missing = await runConnectorPreflight(home, 'desktop.linux.first-party', {
      platform: 'linux', commandExists: async command => command !== 'python3', desktopDoctor: healthyDoctor,
    });
    assert.equal(missing.state, 'blocked');
    assert.equal(missing.checks.some(check => check.id === 'command:python3' && check.state === 'blocked'), true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('preflight checks environment references by presence only and never returns values', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-preflight-env-'));
  try {
    configureConnector(home, {
      id: 'desktop.linux.first-party', profile: 'desktop-first-party', parameters: {}, environmentKeys: { example: 'Q1X_TEST_SECRET' }, enabled: true,
    });
    const report = await runConnectorPreflight(home, 'desktop.linux.first-party', {
      platform: 'linux',
      env: { Q1X_TEST_SECRET: 'super-secret-value' },
      commandExists: async () => true,
      desktopDoctor: healthyDoctor,
    });
    assert.equal(report.state, 'warning');
    assert.equal(report.checks.some(check => check.id === 'compatibility' && check.state === 'warning'), true);
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes('super-secret-value'), false);
    assert.equal(serialized.includes('Q1X_TEST_SECRET'), true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('preflight propagates actual native bridge doctor blockers', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-preflight-doctor-'));
  try {
    configureConnector(home, {
      id: 'desktop.linux.first-party', profile: 'desktop-first-party', parameters: {}, environmentKeys: {}, enabled: true,
    });
    const report = await runConnectorPreflight(home, 'desktop.linux.first-party', {
      platform: 'linux',
      commandExists: async () => true,
      desktopDoctor: async platform => ({
        protocol: 'q1x-desktop-bridge/1', platform, state: 'blocked',
        checks: [{ id: 'atspi', state: 'blocked', message: 'AT-SPI unavailable', remediation: 'Enable AT-SPI.' }],
      }),
    });
    assert.equal(report.state, 'blocked');
    assert.equal(report.checks.some(check => check.id === 'desktop:atspi' && check.state === 'blocked'), true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
