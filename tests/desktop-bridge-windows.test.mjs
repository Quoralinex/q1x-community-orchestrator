import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWindowsDoctor,
  createWindowsPowerShellInvocation,
  supportedWindowsActions,
} from '../packages/desktop-bridge-windows/dist/windows.js';

const expectedActions = [
  'list-applications', 'launch-application', 'focus-application', 'close-application',
  'list-windows', 'focus-window', 'inspect', 'find', 'click', 'double-click',
  'type', 'press', 'set-value', 'select', 'toggle', 'mouse-move', 'mouse-down',
  'mouse-up', 'wheel', 'drag', 'wait', 'screenshot',
];

test('Windows bridge advertises the baseline action surface', () => {
  assert.deepEqual([...supportedWindowsActions], expectedActions);
});

test('Windows PowerShell invocation uses fixed encoded worker with structured stdin and no shell/elevation flags', () => {
  const invocation = createWindowsPowerShellInvocation({
    protocol: 'q1x-desktop-bridge/1',
    endpoint: { id: 'desktop.windows', platform: 'windows' },
    batch: {
      contractVersion: '1.0.0',
      id: 'desktop.batch.windows',
      actions: [{ id: 'focus', kind: 'focus-application', application: 'notepad' }],
    },
  }, 'powershell.exe');
  assert.equal(invocation.command, 'powershell.exe');
  assert.equal(invocation.shell, false);
  assert.ok(invocation.args.includes('-EncodedCommand'));
  assert.equal(invocation.args.some(arg => /runas|executionpolicy|bypass/i.test(arg)), false);
  assert.ok(invocation.stdin.includes('desktop.batch.windows'));
  assert.equal(invocation.args.join(' ').includes('desktop.batch.windows'), false);
  assert.equal(invocation.args.join(' ').includes('notepad'), false);
});

test('Windows doctor reports unsupported on another platform', async () => {
  const report = await createWindowsDoctor({ platform: 'darwin', powershellCommand: 'powershell.exe', uiAutomationAvailable: true });
  assert.equal(report.platform, 'windows');
  assert.equal(report.state, 'unsupported');
});

test('Windows doctor reports blocked when PowerShell or UI Automation is unavailable', async () => {
  const noShell = await createWindowsDoctor({ platform: 'win32', powershellCommand: null, uiAutomationAvailable: false });
  assert.equal(noShell.state, 'blocked');
  assert.match(noShell.checks.find(check => check.id === 'powershell')?.remediation ?? '', /PowerShell/i);

  const noUia = await createWindowsDoctor({ platform: 'win32', powershellCommand: 'powershell.exe', uiAutomationAvailable: false });
  assert.equal(noUia.state, 'blocked');
  assert.match(noUia.checks.find(check => check.id === 'uiautomation')?.remediation ?? '', /UI Automation/i);
});

test('Windows doctor reports ok for a supported host', async () => {
  const report = await createWindowsDoctor({ platform: 'win32', powershellCommand: 'powershell.exe', uiAutomationAvailable: true });
  assert.equal(report.state, 'ok');
  assert.equal(report.checks.every(check => check.state === 'ok'), true);
});
