import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  OpenControlRuntime,
  SqliteStore,
  runDoctor,
} from '../../packages/runtime/dist/index.js';

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

function runCli(home) {
  const cli = resolve('packages/runtime/dist/cli.js');
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, '--home', home, 'status'], {
      cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) reject(new Error(`CLI status failed (${code}): ${stderr}`));
      else {
        try { JSON.parse(stdout); resolvePromise(); }
        catch (error) { reject(error); }
      }
    });
  });
}

function seedSupervision(runtime) {
  const now = new Date().toISOString();
  runtime.putMission({
    contractVersion: '1.0.0', id: 'mission.stress', title: 'Stress mission',
    objective: 'Exercise bounded supervision', status: 'active',
    outcomes: [{ id: 'outcome.stress', description: 'Complete', successCriteria: ['Complete'] }],
    constraints: {}, createdAt: now,
  });
  runtime.putProgramme({
    contractVersion: '1.0.0', id: 'programme.stress', missionId: 'mission.stress',
    revision: 1, status: 'active',
    workstreams: [{ id: 'ws.stress', title: 'Stress', objective: 'Stress', status: 'active' }],
    createdAt: now, updatedAt: now,
  });
  runtime.putWorkGraph({
    contractVersion: '1.0.0', id: 'graph.stress', programmeId: 'programme.stress',
    revision: 1,
    nodes: [{ id: 'task.stress', kind: 'task', title: 'Stress task', parentId: 'ws.stress', status: 'ready', capabilityRequirements: [{ operation: 'execute', adapterKinds: ['cli-tui'] }] }],
    edges: [], updatedAt: now,
  });
  runtime.putCapability({
    contractVersion: '1.0.0', id: 'cap.stress', name: 'Stress capability', adapterKind: 'cli-tui',
    operations: ['execute'], modalities: { input: ['structured-data'], output: ['structured-data'] },
    availability: { state: 'available', checkedAt: now }, cost: { class: 'no-usage-fee' },
    privacy: { executionLocation: 'local', dataRetention: 'none' },
    trust: { level: 'validated', validatedAt: now }, platforms: ['macos', 'linux', 'windows'],
  });
  runtime.putExecutionBinding({
    contractVersion: '1.0.0', id: 'binding.stress', capabilityId: 'cap.stress',
    executorKind: 'external', operations: ['execute'], enabled: true, priority: 10,
  });
  runtime.registerWorkExecutor('external', { id: 'stress-executor', async execute() { return { status: 'succeeded' }; } });
}
export async function runStress({ sourceSha, maxDurationMs = 120_000 }) {
  validateSourceSha(sourceSha);
  const started = Date.now();
  const home = await mkdtemp(join(tmpdir(), 'q1x-phase13-stress-'));
  let unhandledRejections = 0;
  let uncaughtExceptions = 0;
  const onRejection = () => { unhandledRejections += 1; };
  const onException = () => { uncaughtExceptions += 1; };
  process.on('unhandledRejection', onRejection);
  process.on('uncaughtExceptionMonitor', onException);
  try {
    const runtime = OpenControlRuntime.open({ home });
    seedSupervision(runtime);
    runtime.appendAuditReceipt('phase13.stress.start', { id: 'phase13-stress', kind: 'test' });
    const store = SqliteStore.open(home);
    for (let index = 0; index < 500; index += 1) {
      const id = `stress-document-${index}`;
      store.putDocument({ kind: 'phase13-stress', id, scopeId: null, document: { index } });
      const document = store.getDocument('phase13-stress', id);
      if (document?.index !== index) throw new Error(`Stress document mismatch at ${index}`);
    }
    store.close();
    for (let index = 0; index < 100; index += 1) {
      await runDoctor(runtime, { platform: 'phase13-test' });
    }

    const policy = {
      contractVersion: '1.0.0', id: 'policy.stress',
      maxConcurrentAssignments: 2, maxAttemptsPerWorkItem: 1,
      preferNoUsageFee: true, preferLocal: true, allowUnknownCost: false,
      stopConditions: ['completed', 'idle', 'blocked', 'approval-required', 'budget-exhausted'],
    };
    for (let index = 0; index < 50; index += 1) {
      await runtime.runSupervisionCycle('programme.stress', policy);
      runtime.reconcileInterruptedAssignments('programme.stress');
    }

    await Promise.all(Array.from({ length: 4 }, () => runCli(home)));
    const audit = runtime.verifyAuditChain();
    const sqlite = sqliteIntegrity(runtime.databasePath);
    runtime.close();
    const elapsedMs = Date.now() - started;
    const state = elapsedMs <= maxDurationMs
      && sqlite === 'ok'
      && audit.valid
      && unhandledRejections === 0
      && uncaughtExceptions === 0
      ? 'passed' : 'failed';
    return {
      schema: 'q1x.phase13-stress-evidence.v1', sourceSha,
      generatedAt: new Date().toISOString(), state, elapsedMs, maxDurationMs,
      counts: {
        documentOperations: 1_000,
        doctorCycles: 100,
        supervisionRecoveryCycles: 50,
        concurrentCliAccess: 4,
      },
      sqliteIntegrity: sqlite,
      auditValid: audit.valid,
      unhandledRejections,
      uncaughtExceptions,
      externalProviderCalls: 0,
    };
  } finally {
    process.off('unhandledRejection', onRejection);
    process.off('uncaughtExceptionMonitor', onException);
    await rm(home, { recursive: true, force: true });
  }
}
function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceSha = option('--source-sha') ?? process.env.GITHUB_SHA ?? process.env.Q1X_SOURCE_SHA;
  if (!sourceSha) throw new Error('--source-sha is required outside CI');
  const maxDurationMs = Number(option('--max-ms') ?? 120_000);
  const report = await runStress({ sourceSha, maxDurationMs });
  const output = option('--output');
  if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.state !== 'passed') process.exitCode = 1;
}
