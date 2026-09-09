import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { configureConnector } from '../packages/runtime/dist/connectors/configuration.js';
import { runDoctor } from '../packages/runtime/dist/doctor.js';
import { OpenControlRuntime } from '../packages/runtime/dist/runtime.js';

const healthyNativeDoctor = async platform => ({
  protocol: 'q1x-desktop-bridge/1', platform, state: 'ok',
  checks: [{ id: 'native', state: 'ok', message: 'native automation ready' }],
});

test('doctor reports runtime, host, first-party desktop and configured connector diagnostics without secrets', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-doctor-'));
  let runtime;
  try {
    configureConnector(home, {
      id: 'desktop.linux.first-party', profile: 'desktop-first-party', parameters: {}, environmentKeys: { credential: 'Q1X_DOCTOR_SECRET' }, enabled: true,
    });
    runtime = OpenControlRuntime.open({ home });
    const report = await runDoctor(runtime, {
      platform: 'linux',
      env: { Q1X_DOCTOR_SECRET: 'never-return-this-value' },
      commandExists: async () => true,
      desktopDoctor: healthyNativeDoctor,
    });
    assert.equal(report.platform, 'linux');
    assert.equal(report.checks.some(check => check.id === 'runtime' && check.state === 'ok'), true);
    assert.equal(report.checks.some(check => check.id === 'desktop-bridge' && check.state === 'ok'), true);
    assert.equal(report.connectors.length, 1);
    assert.equal(report.connectors[0].connectorId, 'desktop.linux.first-party');
    assert.equal(report.state, 'warning');
    assert.equal(JSON.stringify(report).includes('never-return-this-value'), false);
  } finally {
    runtime?.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('doctor aggregate is blocked when native desktop prerequisites are blocked', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-doctor-blocked-'));
  let runtime;
  try {
    runtime = OpenControlRuntime.open({ home });
    const report = await runDoctor(runtime, {
      platform: 'linux',
      commandExists: async () => true,
      desktopDoctor: async platform => ({
        protocol: 'q1x-desktop-bridge/1', platform, state: 'blocked',
        checks: [{ id: 'atspi', state: 'blocked', message: 'AT-SPI is unavailable', remediation: 'Enable accessibility.' }],
      }),
    });
    assert.equal(report.state, 'blocked');
    assert.equal(report.checks.some(check => check.id === 'desktop:atspi' && check.state === 'blocked'), true);
  } finally {
    runtime?.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('doctor reports not-configured when no connectors have been added and native prerequisites are healthy', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-doctor-empty-'));
  let runtime;
  try {
    runtime = OpenControlRuntime.open({ home });
    const report = await runDoctor(runtime, {
      platform: 'linux', commandExists: async () => true, desktopDoctor: healthyNativeDoctor,
    });
    assert.equal(report.state, 'not-configured');
    assert.equal(report.checks.some(check => check.id === 'connectors' && check.state === 'not-configured'), true);
  } finally {
    runtime?.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('q1x doctor --json emits one structured report without requiring source edits', async () => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-doctor-cli-'));
  try {
    const cli = new URL('../packages/runtime/dist/cli.js', import.meta.url);
    const result = spawnSync(process.execPath, [cli.pathname, '--home', home, 'doctor', '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.contractVersion, '1.0.0');
    assert.ok(['ok', 'warning', 'blocked', 'unsupported', 'not-configured'].includes(report.state));
    assert.ok(Array.isArray(report.checks));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
