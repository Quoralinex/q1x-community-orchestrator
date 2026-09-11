import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const docs = new URL('../docs/', import.meta.url);
const root = new URL('..', import.meta.url);
async function exists(name) { try { await access(new URL(name, docs)); return true; } catch { return false; } }
async function read(name) { return readFile(new URL(name, docs), 'utf8'); }

test('manual set covers install use operate recover and extend', async () => {
  for (const file of ['user-guide.md', 'operator-guide.md', 'developer-guide.md', 'cli-reference.md']) {
    assert.equal(await exists(file), true, `${file} must exist`);
  }
  const operator = await read('operator-guide.md');
  for (const command of ['backup create', 'backup verify', 'backup restore', 'audit verify', 'recovery reconcile', 'limits show']) {
    assert.match(operator, new RegExp(command.replace(' ', '\\s+'), 'i'));
  }
});

test('manuals preserve standalone and evidence boundaries', async () => {
  const text = `${await read('user-guide.md')}\n${await read('operator-guide.md')}\n${await read('developer-guide.md')}`;
  assert.match(text, /no mandatory.*control plane|no private.*service/i);
  assert.match(text, /fixture|hosted-runner|physical-host/i);
  assert.doesNotMatch(text, /production[- ]ready|guaranteed compatibility/i);
});

test('generated CLI reference is current and comes from executable command metadata', async () => {
  const result = spawnSync(process.execPath, ['scripts/docs/generate-cli-reference.mjs', '--check'], {
    cwd: root, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const reference = await read('cli-reference.md');
  for (const command of ['q1x doctor', 'q1x backup create', 'q1x connectors list', 'q1x supervision run', 'q1x audit verify']) {
    assert.match(reference, new RegExp(command.replaceAll(' ', '\\s+')));
  }
});

test('generated CLI reference has exactly one terminal newline', async () => {
  const reference = await read('cli-reference.md');
  assert.equal(reference.endsWith('\n'), true);
  assert.equal(reference.endsWith('\n\n'), false);
});

test('README and Pages index link the four operating manuals', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const index = await read('index.md');
  for (const file of ['user-guide.md', 'operator-guide.md', 'developer-guide.md', 'cli-reference.md']) {
    assert.match(readme, new RegExp(file.replace('.', '\\.')));
    assert.match(index, new RegExp(file.replace('.', '\\.')));
  }
});
