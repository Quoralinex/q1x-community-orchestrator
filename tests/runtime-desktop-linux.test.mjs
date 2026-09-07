import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileLinuxX11DesktopAction,
  createLinuxX11DesktopBackend,
  RuntimeError
} from '../packages/runtime/dist/index.js';

const endpoint = {
  contractVersion: '1.0.0',
  id: 'desktop.linux',
  name: 'Linux desktop',
  backend: 'linux-x11',
  platforms: ['linux'],
  screenshotDir: '/tmp/q1x-desktop-shots',
  allowedApplications: [{
    id: 'editor', name: 'Editor', selectors: [
      { platform: 'linux', kind: 'process-name', value: 'gedit' },
      { platform: 'linux', kind: 'command', value: '/usr/bin/gedit' }
    ]
  }]
};
test('Linux backend compiles launch, activate and input to direct argv', () => {
  const launch = compileLinuxX11DesktopAction(endpoint, { id:'launch', kind:'launch', applicationId:'editor' });
  assert.deepEqual(launch, { command:'/usr/bin/gedit', args:[], timeoutMs:30000 });
  const activate = compileLinuxX11DesktopAction(endpoint, { id:'activate', kind:'activate', applicationId:'editor' });
  assert.equal(activate.command, 'xdotool');
  assert.deepEqual(activate.args.slice(0, 3), ['search','--onlyvisible','--class']);
  const type = compileLinuxX11DesktopAction(endpoint, { id:'type', kind:'type', applicationId:'editor', text:'hello; rm -rf /' });
  assert.equal(type.command, 'xdotool');
  assert.ok(type.args.includes('hello; rm -rf /'));
});

test('Linux screenshot path is bounded to screenshotDir', () => {
  const capture = compileLinuxX11DesktopAction(endpoint, { id:'shot', kind:'screenshot', outputPath:'screen.png' });
  assert.ok(['gnome-screenshot','scrot','import'].includes(capture.command));
  assert.throws(
    () => compileLinuxX11DesktopAction(endpoint, { id:'bad', kind:'screenshot', outputPath:'../escape.png' }),
    error => error instanceof RuntimeError && error.code === 'INSECURE_ENDPOINT'
  );
});
test('Linux X11 probe rejects Wayland-only sessions and missing xdotool', async () => {
  const backend = createLinuxX11DesktopBackend({
    platform: 'linux',
    env: { XDG_SESSION_TYPE:'wayland', WAYLAND_DISPLAY:'wayland-0' },
    commandExists: () => true
  });
  const probe = await backend.probe();
  assert.equal(probe.available, false);
  assert.match(probe.reason, /X11/i);

  const missing = createLinuxX11DesktopBackend({
    platform: 'linux', env: { DISPLAY:':0', XDG_SESSION_TYPE:'x11' },
    commandExists: command => command !== 'xdotool'
  });
  const missingProbe = await missing.probe();
  assert.equal(missingProbe.available, false);
  assert.match(missingProbe.reason, /xdotool/i);
});

test('Linux backend reports unavailable on this non-Linux host', async () => {
  const probe = await createLinuxX11DesktopBackend().probe();
  if (process.platform !== 'linux') assert.equal(probe.available, false);
});
