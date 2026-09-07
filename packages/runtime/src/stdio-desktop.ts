import { spawn } from 'node:child_process';
import type { DesktopActionBatch, DesktopActionResult, DesktopBatchResult, DesktopEndpoint } from '@quoralinex/q1x-community-sdk';
import { CONTRACT_VERSION } from '@quoralinex/q1x-community-contracts';
import { DesktopBackendRegistry, type DesktopBackend } from './desktop-backend.js';
import { resolveDesktopEnvironment } from './desktop-security.js';
import { RuntimeError } from './errors.js';

type JsonRecord = Record<string, unknown>;

interface ProcessOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  outputLimited: boolean;
  spawnError?: string;
}

function object(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function boundedAppend(current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>, limit: number): { value: Buffer<ArrayBufferLike>; limited: boolean } {
  const next = Buffer.concat([current, chunk]);
  if (next.length <= limit) return { value: next, limited: false };
  return { value: next.subarray(0, limit), limited: true };
}

async function runBridge(endpoint: DesktopEndpoint, batch: DesktopActionBatch, signal?: AbortSignal): Promise<ProcessOutcome> {
  const transport = endpoint.transport;
  const maxOutput = transport.maxOutputBytes ?? 4 * 1024 * 1024;
  const child = spawn(transport.command, transport.args ?? [], {
    cwd: transport.cwd,
    env: resolveDesktopEnvironment(endpoint),
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let outputLimited = false;
  let timedOut = false;
  let aborted = false;
  let spawnError: string | undefined;

  child.stdout.on('data', chunk => {
    const next = boundedAppend(stdout, Buffer.from(chunk), maxOutput);
    stdout = next.value;
    if (next.limited) { outputLimited = true; child.kill(); }
  });
  child.stderr.on('data', chunk => {
    const next = boundedAppend(stderr, Buffer.from(chunk), maxOutput);
    stderr = next.value;
    if (next.limited) { outputLimited = true; child.kill(); }
  });
  child.on('error', error => { spawnError = error.name; });

  const timeoutMs = Math.min(batch.timeoutMs ?? Number.MAX_SAFE_INTEGER, transport.timeoutMs ?? 30000);
  const timeout = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
  const abort = () => { aborted = true; child.kill(); };
  signal?.addEventListener('abort', abort, { once: true });

  child.stdin.end(JSON.stringify({
    protocol: 'q1x-desktop-bridge/1',
    endpoint: { id: endpoint.id, platform: endpoint.platform },
    batch
  }));

  const code = await new Promise<number | null>(resolve => {
    child.on('close', value => resolve(value));
  });

  clearTimeout(timeout);
  signal?.removeEventListener('abort', abort);
  return {
    code,
    stdout: stdout.toString('utf8'),
    stderr: stderr.toString('utf8'),
    timedOut,
    aborted,
    outputLimited,
    ...(spawnError ? { spawnError } : {})
  };
}

function normalizeAction(value: unknown): DesktopActionResult {
  const item = object(value);
  if (!item || typeof item.id !== 'string' || !['succeeded', 'failed', 'cancelled'].includes(String(item.status)) || typeof item.durationMs !== 'number') {
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge returned an invalid action result');
  }
  const error = object(item.error);
  return {
    id: item.id,
    status: item.status as DesktopActionResult['status'],
    durationMs: item.durationMs,
    ...(Object.prototype.hasOwnProperty.call(item, 'output') ? { output: item.output } : {}),
    ...(error && typeof error.code === 'string' && typeof error.message === 'string'
      ? { error: { code: error.code, message: error.message } }
      : {})
  };
}

function normalizeResult(value: unknown, batch: DesktopActionBatch): DesktopBatchResult {
  const wrapped = object(value);
  if (wrapped?.ok === false) {
    const error = object(wrapped.error);
    const code = typeof error?.code === 'string' ? error.code.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 80) : 'BRIDGE_ERROR';
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', `Desktop bridge reported a controlled failure (${code})`);
  }
  const candidate = wrapped?.ok === true ? wrapped.result : value;
  const result = object(candidate);
  if (!result || result.contractVersion !== CONTRACT_VERSION || result.batchId !== batch.id || typeof result.id !== 'string') {
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge returned an invalid batch result');
  }
  const status = String(result.status);
  if (!['succeeded', 'failed', 'cancelled', 'partial'].includes(status) || !Array.isArray(result.actions)) {
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge returned an invalid batch status');
  }
  const metadata = object(result.metadata);
  return {
    contractVersion: CONTRACT_VERSION,
    id: result.id,
    batchId: batch.id,
    status: status as DesktopBatchResult['status'],
    actions: result.actions.map(normalizeAction),
    ...(typeof result.startedAt === 'string' ? { startedAt: result.startedAt } : {}),
    ...(typeof result.finishedAt === 'string' ? { finishedAt: result.finishedAt } : {}),
    ...(metadata ? { metadata } : {})
  };
}

class StdioDesktopBridgeBackend implements DesktopBackend {
  readonly id = 'stdio-bridge';

  async execute(endpoint: DesktopEndpoint, batch: DesktopActionBatch, signal?: AbortSignal): Promise<DesktopBatchResult> {
    const outcome = await runBridge(endpoint, batch, signal);
    if (outcome.timedOut) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge timed out');
    if (outcome.aborted) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge execution was cancelled');
    if (outcome.outputLimited) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge exceeded the configured output limit');
    if (outcome.spawnError) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', `Desktop bridge failed to start (${outcome.spawnError})`);
    if (outcome.code !== 0) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', `Desktop bridge exited unsuccessfully (${outcome.code ?? 'signal'})`);
    let payload: unknown;
    try { payload = JSON.parse(outcome.stdout.trim() || 'null') as unknown; }
    catch { throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge returned invalid JSON'); }
    return normalizeResult(payload, batch);
  }
}

export function createDefaultDesktopBackendRegistry(): DesktopBackendRegistry {
  return new DesktopBackendRegistry([new StdioDesktopBridgeBackend()]);
}
