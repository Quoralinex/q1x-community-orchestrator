import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyStandaloneRoot } from '../scripts/phase12/verify-standalone.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'q1x-phase12-standalone-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of [
    'packages/runtime/src', 'connectors/profiles', '.github/workflows',
    'scripts/release', 'docs', 'examples',
  ]) await mkdir(join(root, path), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: 'fixture', private: true, dependencies: { zod: '4.5.4' },
  }));
  await writeFile(join(root, 'packages/runtime/src/index.ts'), 'export const runtime = true;\n');
  await writeFile(join(root, 'connectors/profiles/public.json'), JSON.stringify({
    id: 'mcp.public', url: 'https://example.com/mcp',
  }));
  await writeFile(join(root, 'README.md'), '# Standalone fixture\n');
  return root;
}

async function expectBlocked(root, path, content, pattern) {
  await writeFile(join(root, path), content);
  const report = await verifyStandaloneRoot(root);
  assert.equal(report.ok, false);
  assert.match(report.findings.map(item => item.reason).join('\n'), pattern);
}
test('standalone verifier accepts a public-only active product surface', async t => {
  const root = await fixture(t);
  const report = await verifyStandaloneRoot(root);
  assert.equal(report.ok, true, JSON.stringify(report.findings));
});

test('standalone verifier rejects a private-service package dependency', async t => {
  const root = await fixture(t);
  await expectBlocked(root, 'package.json', JSON.stringify({
    name: 'fixture', dependencies: { '@quoralinex/q1x-control-plane': '1.0.0' },
  }), /private package/i);
});

test('standalone verifier rejects a reserved private-service endpoint', async t => {
  const root = await fixture(t);
  await expectBlocked(
    root,
    'packages/runtime/src/index.ts',
    "export const endpoint = 'https://control-plane.q1x.xyz/authority';\n",
    /private service endpoint/i,
  );
});

test('standalone verifier rejects reserved private-service environment keys', async t => {
  const root = await fixture(t);
  await expectBlocked(
    root,
    '.github/workflows/test.yml',
    'env:\n  Q1X_CONTROL_PLANE_URL: value\n',
    /reserved private environment/i,
  );
});
test('standalone verifier rejects private authority and continuity callbacks', async t => {
  const root = await fixture(t);
  await expectBlocked(
    root,
    'packages/runtime/src/index.ts',
    'export const authorityCallback = () => true;\nexport const continuityCallback = () => true;\n',
    /private callback/i,
  );
});

test('standalone verifier rejects a built-in private-service connector profile', async t => {
  const root = await fixture(t);
  await expectBlocked(
    root,
    'connectors/profiles/private.json',
    JSON.stringify({ id: 'q1x.control-plane', category: 'mcp', protocol: 'mcp-streamable-http-v2' }),
    /private connector/i,
  );
});
