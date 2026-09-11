import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { OpenControlRuntime } from '../../packages/runtime/dist/index.js';

function validateSourceSha(sourceSha) {
  if (typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/i.test(sourceSha)) {
    throw new Error('sourceSha must be a 40-character Git commit SHA');
  }
}
function validateCycles(cycles) {
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 1000) {
    throw new Error('cycles must be an integer between 1 and 1000');
  }
}
function sqliteIntegrity(path) {
  const db = new DatabaseSync(path);
  try {
    const row = db.prepare('PRAGMA integrity_check').get();
    return String(Object.values(row ?? {})[0] ?? 'unknown');
  } finally { db.close(); }
}
async function fileDescriptorCount() {
  for (const path of ['/dev/fd', '/proc/self/fd']) {
    try { return (await readdir(path)).length; } catch {}
  }
  return null;
}
function seed(runtime) {
  const now = new Date().toISOString();
  runtime.putMission({
    contractVersion: '1.0.0', id: 'mission.restart', title: 'Restart campaign mission',
    objective: 'Exercise bounded local restart recovery', status: 'active',
    outcomes: [{ id: 'outcome.restart', description: 'Recover deterministically', successCriteria: ['Stable'] }],
    constraints: {}, createdAt: now,
  });
  runtime.putProgramme({
    contractVersion: '1.0.0', id: 'programme.restart', missionId: 'mission.restart', revision: 1,
    status: 'active', workstreams: [{ id: 'ws.restart', title: 'Restart', objective: 'Restart', status: 'active' }],
    createdAt: now, updatedAt: now,
  });
  runtime.putWorkGraph({
    contractVersion: '1.0.0', id: 'graph.restart', programmeId: 'programme.restart', revision: 1,
    nodes: [{ id: 'task.restart', kind: 'task', title: 'Restart task', parentId: 'ws.restart', status: 'pending' }],
    edges: [], updatedAt: now,
  });
}
export async function runRestartCampaign({ sourceSha, cycles }) {
  validateSourceSha(sourceSha);
  validateCycles(cycles);
  const home = await mkdtemp(join(tmpdir(), 'q1x-phase14-restart-'));
  let peakRss = process.memoryUsage().rss;
  let reconciledOperations = 0;
  let cyclesCompleted = 0;
  try {
    let runtime = OpenControlRuntime.open({ home });
    seed(runtime);
    runtime.appendAuditReceipt('phase14.restart.start', { id: 'phase14-restart', kind: 'test' });
    runtime.close();

    for (let cycle = 0; cycle < cycles; cycle += 1) {
      runtime = OpenControlRuntime.open({ home });
      reconciledOperations += runtime.reconcileExternalOperations().length;
      if (!runtime.verifyAuditChain().valid || sqliteIntegrity(runtime.databasePath) !== 'ok') {
        runtime.close();
        break;
      }
      runtime.createCheckpoint('programme.restart', `checkpoint.restart.${cycle}`);
      const operation = runtime.beginExternalOperation({
        id: `operation.restart.${cycle}`, kind: 'supervision', subjectId: 'programme.restart',
        retrySafe: true, metadata: { cycle },
      });
      runtime.markExternalOperationDispatched(operation.id);
      const injectInterrupted = cycle % 5 === 4 && cycle < cycles - 1;
      if (!injectInterrupted) {
        runtime.completeExternalOperation(operation.id, { state: 'completed', resultRef: `result.restart.${cycle}` });
      }
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      cyclesCompleted += 1;
      runtime.close();
    }

    runtime = OpenControlRuntime.open({ home });
    reconciledOperations += runtime.reconcileExternalOperations().length;
    const operations = runtime.listExternalOperations();
    const unresolvedExternalOperations = operations.filter(item => item.state === 'dispatched').length;
    const uncertainOperations = operations.filter(item => item.state === 'interrupted-uncertain').length;
    const auditValid = runtime.verifyAuditChain().valid;
    const sqlite = sqliteIntegrity(runtime.databasePath);
    const openHandleCount = typeof process._getActiveHandles === 'function' ? process._getActiveHandles().length : null;
    const fileDescriptors = await fileDescriptorCount();
    runtime.close();
    return {
      schema: 'q1x.phase14-restart-evidence.v1', sourceSha,
      cyclesRequested: cycles, cyclesCompleted, reconciledOperations, uncertainOperations,
      peakRss, openHandleCount, fileDescriptorCount: fileDescriptors,
      sqliteIntegrity: sqlite, auditValid, unresolvedExternalOperations,
      externalProviderCalls: 0,
      state: cyclesCompleted === cycles && sqlite === 'ok' && auditValid && unresolvedExternalOperations === 0 && reconciledOperations >= 1
        ? 'passed' : 'failed',
    };
  } finally { await rm(home, { recursive: true, force: true }); }
}
function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const sourceSha = option('--source-sha');
  if (!sourceSha) throw new Error('--source-sha is required');
  const cycles = Number(option('--cycles'));
  if (!Number.isInteger(cycles)) throw new Error('--cycles <n> is required');
  const report = await runRestartCampaign({ sourceSha, cycles });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.state !== 'passed') process.exitCode = 1;
}
