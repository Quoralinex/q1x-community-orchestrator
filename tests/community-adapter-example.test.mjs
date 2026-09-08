import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { runAdapterConformance } from '../packages/adapter-sdk/dist/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const example = new URL('../examples/community-adapter/', import.meta.url);

const endpoint = {
  contractVersion: '1.0.0',
  id: 'adapter.community.echo.reference',
  name: 'Community echo reference adapter',
  adapterKind: 'cli-tui',
  protocol: 'community.echo',
  transport: { kind: 'stdio', command: 'node', args: [], inputMode: 'json', outputMode: 'json' },
};

const request = {
  contractVersion: '1.0.0',
  id: 'execution.community.echo.reference',
  workItemId: 'task.community.echo.reference',
  requirements: { operations: ['community.echo'], adapterKinds: ['cli-tui'] },
  input: { text: 'reference-echo' },
  createdAt: '2026-09-08T16:00:00.000Z',
};

test('community adapter reference template has the required public files and safe dependency surface', async () => {
  for (const relative of ['package.json', 'tsconfig.json', 'src/index.ts', 'test/adapter.test.mjs', 'README.md']) {
    assert.equal((await stat(new URL(relative, example))).isFile(), true, relative);
  }

  const pkg = JSON.parse(await readFile(new URL('package.json', example), 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines.node, '>=24');
  assert.equal(pkg.dependencies['@quoralinex/q1x-community-adapter-sdk'], '0.1.0-alpha.1');
  const serialized = JSON.stringify(pkg).toLowerCase();
  for (const forbidden of ['playwright', 'puppeteer', 'selenium', 'keytar', 'dotenv', 'axios', 'node-fetch']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
});

test('community adapter reference template builds and passes public conformance without network or secrets', async () => {
  const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
  const tsconfig = fileURLToPath(new URL('tsconfig.json', example));
  const build = spawnSync(process.execPath, [tsc, '-p', tsconfig], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const module = await import(new URL('dist/index.js', example));
  assert.equal(module.communityEchoAdapter.protocol, 'community.echo');
  const report = await runAdapterConformance(module.communityEchoAdapter, { endpoint, request });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.deepEqual(report.checks.map(check => check.ok), report.checks.map(() => true));
});

test('reference adapter documentation states explicit registration and trust limits', async () => {
  const readme = await readFile(new URL('README.md', example), 'utf8');
  assert.match(readme, /explicit/i);
  assert.match(readme, /operator/i);
  assert.match(readme, /conformance/i);
  assert.match(readme, /not.*sandbox/i);
  assert.match(readme, /no network/i);
  assert.match(readme, /PolyForm Noncommercial/i);
});
