import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileMacosDesktopAction,
  createMacosDesktopBackend
} from '../packages/runtime/dist/index.js';

const endpoint = {
  contractVersion: '1.0.0', id: 'desktop.macos', name: 'macOS Desktop',
  backend: 'macos-native', platforms: ['macos'],
  allowedApplications: [{
    id: 'app.notes', name: 'Notes',
    selectors: [
      { platform: 'macos', kind: 'bundle-id', value: 'com.apple.Notes' },
      { platform: 'macos', kind: 'application-name', value: 'Notes' }
    ]
  }],
  screenshotDir: '/tmp/q1x-desktop-tests'
};

const action = (kind, extra = {}) => ({ id: `action.${kind}`, kind, applicationId: 'app.notes', ...extra });
test('macOS backend compiles lifecycle actions to fixed direct commands', () => {
  assert.deepEqual(compileMacosDesktopAction(endpoint, action('launch')), {
    command: '/usr/bin/open', args: ['-b', 'com.apple.Notes'], timeoutMs: 30000
  });
  assert.equal(compileMacosDesktopAction(endpoint, action('activate')).command, '/usr/bin/osascript');
  assert.equal(compileMacosDesktopAction(endpoint, action('quit')).command, '/usr/bin/osascript');
  const inspect = compileMacosDesktopAction(endpoint, action('inspect'));
  assert.equal(inspect.command, '/usr/bin/osascript');
  assert.match(inspect.args.at(-1), /Notes/);
});

test('macOS screenshot command is bounded to the endpoint directory', () => {
  const shot = compileMacosDesktopAction(endpoint, action('screenshot', { outputPath: 'screen.png' }));
  assert.equal(shot.command, '/usr/sbin/screencapture');
  assert.equal(shot.args.at(-1), '/tmp/q1x-desktop-tests/screen.png');
  assert.throws(() => compileMacosDesktopAction(endpoint, action('screenshot', { outputPath: '../escape.png' })));
});
test('macOS backend reports optional mouse support without requiring it', async () => {
  const probe = await createMacosDesktopBackend().probe();
  if (process.platform === 'darwin') {
    assert.equal(probe.available, true);
    assert.equal(probe.platform, 'macos');
    assert.ok(probe.operations.includes('launch'));
    assert.ok(probe.operations.includes('screenshot'));
    assert.equal(typeof probe.metadata?.mouseTool, 'string');
  } else {
    assert.equal(probe.available, false);
  }
});

test('macOS backend never compiles arbitrary shell commands', () => {
  const compiled = compileMacosDesktopAction(endpoint, action('press', { key: 'return' }));
  assert.equal(compiled.command, '/usr/bin/osascript');
  assert.ok(!compiled.args.includes('sh'));
  assert.throws(() => compileMacosDesktopAction(endpoint, action('launch', { applicationId: 'app.unknown' })));
});
