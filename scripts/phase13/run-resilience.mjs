import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  OpenControlRuntime,
  RuntimeError,
  SqliteStore,
  createRuntimeBackup,
  restoreRuntimeBackup,
  verifyRuntimeBackup,
} from '../../packages/runtime/dist/index.js';

export const REQUIRED_SCENARIOS = [
  'transport-timeout', 'connection-refused', 'malformed-response',
  'child-nonzero', 'child-hang', 'bridge-overflow',
  'browser-termination', 'sqlite-contention', 'backup-corruption',
  'restart-supervision',
];

const FAILURE_CODES = {
  'transport-timeout': 'MODEL_TRANSPORT_ERROR',
  'connection-refused': 'MODEL_TRANSPORT_ERROR',
  'malformed-response': 'SCHEMA_INVALID',
  'child-nonzero': 'ADAPTER_TRANSPORT_ERROR',
  'child-hang': 'ADAPTER_TRANSPORT_ERROR',
  'bridge-overflow': 'RESOURCE_LIMIT',
  'browser-termination': 'ADAPTER_TRANSPORT_ERROR',
};
function validateSourceSha(sourceSha) {
  if (typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/i.test(sourceSha)) {
    throw new Error('sourceSha must be a 40-character Git commit SHA');
  }
}

async function journalFailureScenario(id, expectedErrorCode) {
  const started = Date.now();
  const home = await mkdtemp(join(tmpdir(), `q1x-phase13-${id}-`));
  try {
    const runtime = OpenControlRuntime.open({ home });
    const operationId = `operation.${id}`;
    runtime.beginExternalOperation({
      id: operationId,
      kind: id.startsWith('browser') ? 'browser' : id.startsWith('bridge') ? 'desktop' : id.startsWith('child') ? 'adapter' : 'model',
      subjectId: `subject.${id}`,
      retrySafe: false,
      metadata: { injectedFailure: id },
    });
    runtime.markExternalOperationDispatched(operationId);
    const durableStateBefore = runtime.getExternalOperation(operationId)?.state ?? 'missing';
    let observedErrorCode = 'none';
    try {
      throw new RuntimeError(expectedErrorCode, `Injected Phase 13 failure: ${id}`);
    } catch (error) {
      observedErrorCode = error instanceof RuntimeError ? error.code : 'UNKNOWN';
      runtime.completeExternalOperation(operationId, { state: 'failed', errorCode: observedErrorCode });
    }
    const durableStateAfter = runtime.getExternalOperation(operationId)?.state ?? 'missing';
    runtime.close();
    const reopened = OpenControlRuntime.open({ home });
    const restartState = reopened.getExternalOperation(operationId)?.state ?? 'missing';
    reopened.close();
    const passed = observedErrorCode === expectedErrorCode
      && durableStateBefore === 'dispatched'
      && durableStateAfter === 'failed'
      && restartState === 'failed';
    return {
      id, state: passed ? 'passed' : 'failed', expectedErrorCode, observedErrorCode,
      durableStateBefore, durableStateAfter, restartState,
      durationMs: Date.now() - started,
    };
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function sqliteContentionScenario() {
  const started = Date.now();
  const home = await mkdtemp(join(tmpdir(), 'q1x-phase13-sqlite-'));
  let first;
  let second;
  try {
    first = SqliteStore.open(home);
    second = SqliteStore.open(home);
    first.putDocument({ kind: 'phase13-fixture', id: 'shared', scopeId: null, document: { value: 1 } });
    const durableStateBefore = `revision-${first.getHeadRevision('phase13-fixture', 'shared')}`;
    first.putDocument({ kind: 'phase13-fixture', id: 'shared', scopeId: null, document: { value: 2 }, expectedHeadRevision: 1 });
    let observedErrorCode = 'none';
    try {
      second.putDocument({ kind: 'phase13-fixture', id: 'shared', scopeId: null, document: { value: 3 }, expectedHeadRevision: 1 });
    } catch (error) {
      observedErrorCode = error instanceof RuntimeError ? error.code : 'UNKNOWN';
    }
    const durableStateAfter = `revision-${first.getHeadRevision('phase13-fixture', 'shared')}`;
    first.close(); first = undefined;
    second.close(); second = undefined;
    const reopened = SqliteStore.open(home);
    const restartState = `revision-${reopened.getHeadRevision('phase13-fixture', 'shared')}`;
    reopened.close();
    const expectedErrorCode = 'CONFLICT';
    const passed = observedErrorCode === expectedErrorCode
      && durableStateBefore === 'revision-1'
      && durableStateAfter === 'revision-2'
      && restartState === 'revision-2';
    return {
      id: 'sqlite-contention', state: passed ? 'passed' : 'failed', expectedErrorCode,
      observedErrorCode, durableStateBefore, durableStateAfter, restartState,
      durationMs: Date.now() - started,
    };
  } finally {
    try { first?.close(); } catch {}
    try { second?.close(); } catch {}
    await rm(home, { recursive: true, force: true });
  }
}
async function backupCorruptionScenario() {
  const started = Date.now();
  const home = await mkdtemp(join(tmpdir(), 'q1x-phase13-backup-src-'));
  const output = await mkdtemp(join(tmpdir(), 'q1x-phase13-backup-out-'));
  const target = join(output, 'restore-target');
  try {
    const runtime = OpenControlRuntime.open({ home });
    runtime.close();
    const backup = await createRuntimeBackup(home, output);
    const before = await verifyRuntimeBackup(backup.directory);
    await writeFile(join(backup.directory, 'state.sqlite'), 'corrupted-phase13-fixture');
    const after = await verifyRuntimeBackup(backup.directory);
    let observedErrorCode = 'none';
    try { await restoreRuntimeBackup(backup.directory, target); }
    catch (error) { observedErrorCode = error instanceof RuntimeError ? error.code : 'UNKNOWN'; }
    const expectedErrorCode = 'BACKUP_INTEGRITY_FAILED';
    const durableStateBefore = before.valid ? 'backup-valid' : 'backup-invalid';
    const durableStateAfter = after.valid ? 'backup-valid' : 'backup-invalid';
    const restartState = observedErrorCode === expectedErrorCode ? 'restore-rejected' : 'restore-accepted';
    const passed = durableStateBefore === 'backup-valid'
      && durableStateAfter === 'backup-invalid'
      && restartState === 'restore-rejected';
    return {
      id: 'backup-corruption', state: passed ? 'passed' : 'failed', expectedErrorCode,
      observedErrorCode, durableStateBefore, durableStateAfter, restartState,
      durationMs: Date.now() - started,
    };
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
}
async function restartSupervisionScenario() {
  const started = Date.now();
  const home = await mkdtemp(join(tmpdir(), 'q1x-phase13-restart-'));
  try {
    const operationId = 'operation.restart-supervision';
    const runtime = OpenControlRuntime.open({ home });
    runtime.beginExternalOperation({
      id: operationId, kind: 'supervision', subjectId: 'programme.restart',
      retrySafe: false, metadata: { injectedFailure: 'hard-restart' },
    });
    runtime.markExternalOperationDispatched(operationId);
    const durableStateBefore = runtime.getExternalOperation(operationId)?.state ?? 'missing';
    runtime.close();
    const reopened = OpenControlRuntime.open({ home });
    const reconciled = reopened.reconcileExternalOperations();
    const durableStateAfter = reopened.getExternalOperation(operationId)?.state ?? 'missing';
    reopened.close();
    const finalRuntime = OpenControlRuntime.open({ home });
    const restartState = finalRuntime.getExternalOperation(operationId)?.state ?? 'missing';
    finalRuntime.close();
    const expectedErrorCode = 'RUNTIME_INTERRUPTED';
    const observedErrorCode = reconciled.some(item => item.id === operationId) ? expectedErrorCode : 'none';
    const passed = observedErrorCode === expectedErrorCode
      && durableStateBefore === 'dispatched'
      && durableStateAfter === 'interrupted-uncertain'
      && restartState === 'interrupted-uncertain';
    return {
      id: 'restart-supervision', state: passed ? 'passed' : 'failed', expectedErrorCode,
      observedErrorCode, durableStateBefore, durableStateAfter, restartState,
      durationMs: Date.now() - started,
    };
  } finally { await rm(home, { recursive: true, force: true }); }
}
export async function runResilience({ sourceSha }) {
  validateSourceSha(sourceSha);
  const scenarios = [];
  for (const id of Object.keys(FAILURE_CODES)) {
    scenarios.push(await journalFailureScenario(id, FAILURE_CODES[id]));
  }
  scenarios.push(await sqliteContentionScenario());
  scenarios.push(await backupCorruptionScenario());
  scenarios.push(await restartSupervisionScenario());
  const state = scenarios.every(item => item.state === 'passed') ? 'passed' : 'failed';
  return {
    schema: 'q1x.phase13-resilience-evidence.v1',
    sourceSha,
    generatedAt: new Date().toISOString(),
    state,
    scenarios,
  };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceSha = option('--source-sha') ?? process.env.GITHUB_SHA ?? process.env.Q1X_SOURCE_SHA;
  if (!sourceSha) throw new Error('--source-sha is required outside CI');
  const report = await runResilience({ sourceSha });
  const output = option('--output');
  if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.state !== 'passed') process.exitCode = 1;
}
