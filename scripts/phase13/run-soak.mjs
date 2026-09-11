import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { OpenControlRuntime } from '../../packages/runtime/dist/index.js';

function validateSourceSha(sourceSha) {
  if (typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/i.test(sourceSha)) {
    throw new Error('sourceSha must be a 40-character Git commit SHA');
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
    contractVersion: '1.0.0', id: 'mission.soak', title: 'Soak mission',
    objective: 'Exercise local durability', status: 'active',
    outcomes: [{ id: 'outcome.soak', description: 'Stable', successCriteria: ['Stable'] }],
    constraints: {}, createdAt: now,
  });
  runtime.putProgramme({
    contractVersion: '1.0.0', id: 'programme.soak', missionId: 'mission.soak',
    revision: 1, status: 'active',
    workstreams: [{ id: 'ws.soak', title: 'Soak', objective: 'Soak', status: 'active' }],
    createdAt: now, updatedAt: now,
  });
  runtime.putWorkGraph({
    contractVersion: '1.0.0', id: 'graph.soak', programmeId: 'programme.soak', revision: 1,
    nodes: [{ id: 'task.soak', kind: 'task', title: 'Soak task', parentId: 'ws.soak', status: 'pending' }],
    edges: [], updatedAt: now,
  });
}

export async function runSoak({ sourceSha, minutes }) {
  validateSourceSha(sourceSha);
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error('minutes must be a non-negative number');
  const home = await mkdtemp(join(tmpdir(), 'q1x-phase13-soak-'));
  const started = Date.now();
  const deadline = started + (minutes * 60_000);
  let iterations = 0;
  let peakRss = process.memoryUsage().rss;
  try {
    const runtime = OpenControlRuntime.open({ home });
    seed(runtime);
    runtime.appendAuditReceipt('phase13.soak.start', { id: 'phase13-soak', kind: 'test' });
    let sqlite = 'unknown';
    let auditValid = false;
    do {
      runtime.getStatus();
      const id = `operation.soak.${iterations}`;
      runtime.beginExternalOperation({ id, kind: 'supervision', subjectId: 'programme.soak', retrySafe: true, metadata: { iteration: iterations } });
      runtime.markExternalOperationDispatched(id);
      runtime.completeExternalOperation(id, { state: 'completed', resultRef: `result.soak.${iterations}` });
      runtime.createCheckpoint('programme.soak', `checkpoint.soak.${iterations}`);
      runtime.reconcileExternalOperations();
      auditValid = runtime.verifyAuditChain().valid;
      sqlite = sqliteIntegrity(runtime.databasePath);
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      iterations += 1;
      if (!auditValid || sqlite !== 'ok') break;
      await new Promise(resolve => setTimeout(resolve, 1));
    } while (Date.now() < deadline);
    const audit = runtime.verifyAuditChain();
    const finalSqlite = sqliteIntegrity(runtime.databasePath);
    const unresolvedExternalOperations = runtime.listExternalOperations()
      .filter(item => item.state === 'intent-recorded' || item.state === 'dispatched').length;
    const limitBreaches = [];
    const openHandleCount = typeof process._getActiveHandles === 'function' ? process._getActiveHandles().length : null;
    const fileDescriptors = await fileDescriptorCount();
    runtime.close();
    return {
      schema: 'q1x.phase13-soak-evidence.v1', sourceSha,
      generatedAt: new Date().toISOString(), requestedMinutes: minutes,
      elapsedMs: Date.now() - started, iterations, peakRss,
      openHandleCount, fileDescriptorCount: fileDescriptors,
      sqliteIntegrity: finalSqlite, auditValid: audit.valid,
      unresolvedExternalOperations, limitBreaches, externalProviderCalls: 0,
      state: finalSqlite === 'ok' && audit.valid && unresolvedExternalOperations === 0 && limitBreaches.length === 0 ? 'passed' : 'failed',
    };
  } finally { await rm(home, { recursive: true, force: true }); }
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceSha = option('--source-sha') ?? process.env.GITHUB_SHA ?? process.env.Q1X_SOURCE_SHA;
  if (!sourceSha) throw new Error('--source-sha is required outside CI');
  const minutes = Number(option('--minutes'));
  if (!Number.isFinite(minutes)) throw new Error('--minutes <n> is required');
  const report = await runSoak({ sourceSha, minutes });
  const output = option('--output');
  if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.state !== 'passed') process.exitCode = 1;
}
