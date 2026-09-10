import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const childFixture = resolve('tests/fixtures/operation-journal-child.mjs');

test('hard termination after durable dispatch reconciles exactly one uncertain operation', async t => {
  const home = await mkdtemp(join(tmpdir(), 'q1x-crash-recovery-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const child = fork(childFixture, [home], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('child did not reach dispatched boundary')), 10000);
    child.once('message', message => {
      if (message?.type !== 'ready-to-dispatch') return;
      clearTimeout(timer);
      resolveReady();
    });
    child.once('error', reject);
  });
  child.kill('SIGKILL');
  await new Promise(resolveExit => child.once('exit', resolveExit));

  const { OpenControlRuntime } = await import('../packages/runtime/dist/index.js');
  const runtime = OpenControlRuntime.open({ home });
  const reconciled = runtime.reconcileExternalOperations();
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].id, 'operation.crash.fixture');
  assert.equal(reconciled[0].state, 'interrupted-uncertain');
  runtime.close();

  const db = new DatabaseSync(join(home, 'state.sqlite'));
  const terminalResults = db.prepare("SELECT COUNT(*) AS count FROM document_heads WHERE kind = 'execution-result'").get();
  const uncertain = db.prepare("SELECT COUNT(*) AS count FROM external_operations WHERE state = 'interrupted-uncertain'").get();
  const audit = db.prepare("SELECT COUNT(*) AS count FROM security_audit_receipts WHERE event_type = 'operation.uncertain'").get();
  db.close();
  assert.equal(Number(terminalResults.count), 0);
  assert.equal(Number(uncertain.count), 1);
  assert.equal(Number(audit.count), 1);
});
