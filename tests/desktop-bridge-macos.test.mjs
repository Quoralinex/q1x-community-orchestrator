import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMacosDoctor,
  createMacosJxaInvocation,
  supportedMacosActions,
} from '../packages/desktop-bridge-macos/dist/macos.js';

const expectedActions = [
  'list-applications', 'launch-application', 'focus-application', 'close-application',
  'list-windows', 'focus-window', 'inspect', 'find', 'click', 'double-click',
  'type', 'press', 'set-value', 'mouse-move', 'mouse-down', 'mouse-up', 'wheel',
  'drag', 'wait', 'screenshot',
];

test('macOS bridge advertises the baseline action surface', () => {
  assert.deepEqual([...supportedMacosActions], expectedActions);
});

test('macOS JXA invocation uses a fixed executable and argv without shell interpolation', () => {
  const invocation = createMacosJxaInvocation({
    protocol: 'q1x-desktop-bridge/1',
    endpoint: { id: 'desktop.macos', platform: 'macos' },
    batch: {
      contractVersion: '1.0.0',
      id: 'desktop.batch.macos',
      actions: [{ id: 'focus', kind: 'focus-application', application: 'TextEdit' }],
    },
  });
  assert.equal(invocation.command, '/usr/bin/osascript');
  assert.deepEqual(invocation.args.slice(0, 4), ['-l', 'JavaScript', '-e', invocation.args[3]]);
  assert.equal(invocation.shell, false);
  assert.ok(invocation.stdin.includes('desktop.batch.macos'));
  assert.equal(invocation.args[3].includes('desktop.batch.macos'), false);
  assert.equal(invocation.args[3].includes('TextEdit'), false);
});

test('macOS doctor reports unsupported on another platform', async () => {
  const report = await createMacosDoctor({ platform: 'linux', osascriptExists: true, accessibilityTrusted: true });
  assert.equal(report.platform, 'macos');
  assert.equal(report.state, 'unsupported');
  assert.equal(report.checks.some(check => check.id === 'platform' && check.state === 'unsupported'), true);
});

test('macOS doctor reports blocked with actionable accessibility remediation', async () => {
  const report = await createMacosDoctor({ platform: 'darwin', osascriptExists: true, accessibilityTrusted: false });
  assert.equal(report.state, 'blocked');
  const accessibility = report.checks.find(check => check.id === 'accessibility');
  assert.equal(accessibility?.state, 'blocked');
  assert.match(accessibility?.remediation ?? '', /Accessibility/i);
  assert.match(accessibility?.remediation ?? '', /System Settings/i);
});

test('macOS doctor reports ok when platform, osascript and accessibility are available', async () => {
  const report = await createMacosDoctor({ platform: 'darwin', osascriptExists: true, accessibilityTrusted: true });
  assert.equal(report.state, 'ok');
  assert.equal(report.checks.every(check => check.state === 'ok'), true);
});
