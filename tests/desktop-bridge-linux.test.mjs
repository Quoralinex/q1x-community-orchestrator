import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLinuxDoctor,
  createLinuxPythonInvocation,
  supportedLinuxActions,
} from '../packages/desktop-bridge-linux/dist/linux.js';

const expectedActions = [
  'list-applications', 'launch-application', 'focus-application', 'close-application',
  'list-windows', 'focus-window', 'inspect', 'find', 'click', 'double-click',
  'type', 'press', 'set-value', 'select', 'toggle', 'mouse-move', 'mouse-down',
  'mouse-up', 'wheel', 'drag', 'wait', 'screenshot',
];

test('Linux bridge advertises the baseline action surface', () => {
  assert.deepEqual([...supportedLinuxActions], expectedActions);
});

test('Linux worker invocation uses bundled Python worker, structured stdin and no shell', () => {
  const invocation = createLinuxPythonInvocation({
    protocol: 'q1x-desktop-bridge/1',
    endpoint: { id: 'desktop.linux', platform: 'linux' },
    batch: {
      contractVersion: '1.0.0',
      id: 'desktop.batch.linux',
      actions: [{ id: 'focus', kind: 'focus-application', application: 'gedit' }],
    },
  }, 'python3', '/opt/q1x/atspi_bridge.py');
  assert.equal(invocation.command, 'python3');
  assert.deepEqual(invocation.args, ['/opt/q1x/atspi_bridge.py']);
  assert.equal(invocation.shell, false);
  assert.ok(invocation.stdin.includes('desktop.batch.linux'));
  assert.equal(invocation.args.join(' ').includes('gedit'), false);
});

test('Linux doctor reports unsupported on another platform', async () => {
  const report = await createLinuxDoctor({ platform: 'darwin', pythonCommand: 'python3', atspiAvailable: true, displayAvailable: true, sessionType: 'x11' });
  assert.equal(report.platform, 'linux');
  assert.equal(report.state, 'unsupported');
});

test('Linux doctor reports blocked when Python, AT-SPI or graphical session is unavailable', async () => {
  const noPython = await createLinuxDoctor({ platform: 'linux', pythonCommand: null, atspiAvailable: false, displayAvailable: false, sessionType: null });
  assert.equal(noPython.state, 'blocked');
  assert.match(noPython.checks.find(check => check.id === 'python')?.remediation ?? '', /Python/i);

  const noAtspi = await createLinuxDoctor({ platform: 'linux', pythonCommand: 'python3', atspiAvailable: false, displayAvailable: true, sessionType: 'x11' });
  assert.equal(noAtspi.state, 'blocked');
  assert.match(noAtspi.checks.find(check => check.id === 'atspi')?.remediation ?? '', /AT-SPI|PyGObject/i);
});

test('Linux doctor reports ok for a supported X11 accessibility session', async () => {
  const report = await createLinuxDoctor({ platform: 'linux', pythonCommand: 'python3', atspiAvailable: true, displayAvailable: true, sessionType: 'x11' });
  assert.equal(report.state, 'ok');
  assert.equal(report.checks.every(check => check.state === 'ok'), true);
});

test('Linux doctor flags Wayland input limitations without pretending universal support', async () => {
  const report = await createLinuxDoctor({ platform: 'linux', pythonCommand: 'python3', atspiAvailable: true, displayAvailable: true, sessionType: 'wayland' });
  assert.equal(report.state, 'warning');
  assert.match(report.checks.find(check => check.id === 'session')?.message ?? '', /Wayland/i);
});
