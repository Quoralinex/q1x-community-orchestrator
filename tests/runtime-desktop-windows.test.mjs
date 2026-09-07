import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileWindowsDesktopAction,
  createWindowsDesktopBackend
} from '../packages/runtime/dist/index.js';

const endpoint = {
  contractVersion: '1.0.0', id: 'desktop.windows', name: 'Windows Desktop',
  backend: 'windows-native', platforms: ['windows'],
  allowedApplications: [{
    id: 'app.notepad', name: 'Notepad', selectors: [
      { platform: 'windows', kind: 'process-name', value: 'notepad' },
      { platform: 'windows', kind: 'executable-path', value: 'C:\\Windows\\System32\\notepad.exe' }
    ]
  }],
  screenshotDir: 'C:\\Q1X\\screenshots',
  timeoutMs: 30000
};
const action = (kind, extra = {}) => ({ id: `action.${kind}`, kind, applicationId: 'app.notepad', ...extra });
test('Windows backend compiles allowlisted launch and activation to fixed PowerShell argv', () => {
  const launch = compileWindowsDesktopAction(endpoint, action('launch'));
  assert.match(launch.command.toLowerCase(), /powershell\.exe$/);
  assert.equal(launch.args.at(-1), 'C:\\Windows\\System32\\notepad.exe');
  const activate = compileWindowsDesktopAction(endpoint, action('activate'));
  assert.match(activate.command.toLowerCase(), /powershell\.exe$/);
  assert.equal(activate.args.at(-1), 'notepad');
  assert.ok(activate.args.some(value => value.includes('SetForegroundWindow')));
});

test('Windows input is passed as data rather than injected into the fixed script', () => {
  const typed = compileWindowsDesktopAction(endpoint, action('type', { text: 'hello; Remove-Item C:\\*' }));
  const script = typed.args[typed.args.indexOf('-Command') + 1];
  assert.ok(!script.includes('Remove-Item'));
  assert.equal(typed.args.at(-1), 'hello; Remove-Item C:\\*');
});
test('Windows screenshot command remains within configured output root', () => {
  const shot = compileWindowsDesktopAction(endpoint, action('screenshot', { outputPath: 'shot.png' }));
  assert.equal(shot.args.at(-1), 'C:\\Q1X\\screenshots\\shot.png');
  assert.throws(() => compileWindowsDesktopAction(endpoint, action('screenshot', { outputPath: '..\\escape.png' })));
});

test('Windows backend reports unavailable on non-Windows hosts', async () => {
  const probe = await createWindowsDesktopBackend().probe();
  assert.equal(probe.platform, 'windows');
  if (process.platform === 'win32') assert.equal(typeof probe.available, 'boolean');
  else assert.equal(probe.available, false);
});

test('Windows backend rejects applications without Windows selectors', () => {
  const invalid = {
    ...endpoint,
    allowedApplications: [{ id: 'app.bad', name: 'Bad', selectors: [{ platform: 'macos', kind: 'application-name', value: 'Bad' }] }]
  };
  assert.throws(() => compileWindowsDesktopAction(invalid, { ...action('launch'), applicationId: 'app.bad' }));
});
