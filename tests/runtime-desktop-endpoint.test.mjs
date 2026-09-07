import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { OpenControlRuntime, RuntimeError } from '../packages/runtime/dist/index.js';

const endpoint = home => ({
  contractVersion: '1.0.0',
  id: 'desktop.test',
  name: 'Desktop test',
  backend: 'test-desktop',
  platforms: ['macos', 'windows', 'linux'],
  allowedApplications: [{
    id: 'app.editor',
    name: 'Editor',
    selectors: [
      { platform: 'macos', kind: 'bundle-id', value: 'com.example.Editor' },
      { platform: 'windows', kind: 'process-name', value: 'editor.exe' },
      { platform: 'linux', kind: 'desktop-id', value: 'editor.desktop' }
    ]
  }],
  screenshotDir: join(home, 'screenshots'),
  timeoutMs: 30000
});

test('desktop endpoints persist across runtime restart', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-endpoint-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  let runtime = OpenControlRuntime.open({ home });
  assert.equal(runtime.putDesktopEndpoint(endpoint(home)).id, 'desktop.test');
  assert.equal(runtime.listDesktopEndpoints().length, 1);
  assert.equal(runtime.getStatus().counts.desktopEndpoints, 1);
  runtime.close();

  runtime = OpenControlRuntime.open({ home });
  assert.equal(runtime.getDesktopEndpoint('desktop.test').backend, 'test-desktop');
  assert.equal(runtime.listDesktopEndpoints().length, 1);
  runtime.close();
});

test('desktop endpoint security rejects unsafe paths and selector/platform mismatches', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-security-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  const expectInsecure = value => assert.throws(
    () => runtime.putDesktopEndpoint(value),
    error => error instanceof RuntimeError && error.code === 'INSECURE_ENDPOINT'
  );

  expectInsecure({ ...endpoint(home), id: 'desktop.relative-shot', screenshotDir: './shots' });
  expectInsecure({
    ...endpoint(home),
    id: 'desktop.relative-exe',
    allowedApplications: [{
      id: 'app.win', name: 'Windows app',
      selectors: [{ platform: 'windows', kind: 'executable-path', value: '.\\app.exe' }]
    }]
  });
  expectInsecure({
    ...endpoint(home), id: 'desktop.platform-mismatch', platforms: ['macos'],
    allowedApplications: [{
      id: 'app.win', name: 'Windows app',
      selectors: [{ platform: 'windows', kind: 'process-name', value: 'app.exe' }]
    }]
  });
  const duplicate = endpoint(home);
  duplicate.id = 'desktop.duplicate';
  duplicate.allowedApplications = [duplicate.allowedApplications[0], duplicate.allowedApplications[0]];
  expectInsecure(duplicate);
});

test('desktop endpoint accepts absolute cross-platform executable selectors', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-desktop-valid-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const runtime = OpenControlRuntime.open({ home });
  t.after(() => runtime.close());
  const value = endpoint(home);
  value.id = 'desktop.absolute-exe';
  value.allowedApplications = [{
    id: 'app.win', name: 'Windows app',
    selectors: [{ platform: 'windows', kind: 'executable-path', value: 'C:\\Program Files\\App\\app.exe' }]
  }];
  assert.equal(runtime.putDesktopEndpoint(value).id, 'desktop.absolute-exe');
});
