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
  stdinError?: string;
}

interface OutputBuffer {
  chunks: Buffer<ArrayBufferLike>[];
  bytes: number;
}

function object(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function appendBounded(target: OutputBuffer, chunk: Buffer<ArrayBufferLike>, limit: number): boolean {
  const remaining = limit - target.bytes;
  if (remaining <= 0) return true;
  if (chunk.length <= remaining) {
    target.chunks.push(chunk);
    target.bytes += chunk.length;
    return false;
  }
  target.chunks.push(chunk.subarray(0, remaining));
  target.bytes += remaining;
  return true;
}

function collected(target: OutputBuffer): string {
  return Buffer.concat(target.chunks, target.bytes).toString('utf8');
}

async function runBridge(endpoint: DesktopEndpoint, batch: DesktopActionBatch, signal?: AbortSignal): Promise<ProcessOutcome> {
  const transport = endpoint.transport;
  if (!transport) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop stdio transport configuration is missing');

  const maxOutput = transport.maxOutputBytes ?? 4 * 1024 * 1024;
  const useProcessGroup = process.platform !== 'win32';
  const child = spawn(transport.command, transport.args ?? [], {
    cwd: transport.cwd,
    env: resolveDesktopEnvironment(endpoint),
    shell: false,
    detached: useProcessGroup,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const stdout: OutputBuffer = { chunks: [], bytes: 0 };
  const stderr: OutputBuffer = { chunks: [], bytes: 0 };
  let outputLimited = false;
  let timedOut = false;
  let aborted = false;
  let spawnError: string | undefined;
  let stdinError: string | undefined;
  let forceKillTimer: NodeJS.Timeout | undefined;
  let terminationRequested = false;

  const sendSignal = (kind: NodeJS.Signals): void => {
    if (!child.pid) return;
    if (useProcessGroup) {
      try {
        process.kill(-child.pid, kind);
        return;
      } catch {
        // Fall back to the direct child below.
      }
    }
    try { child.kill(kind); } catch { /* process may already have exited */ }
  };

  const terminate = (): void => {
    if (terminationRequested) return;
    terminationRequested = true;
    sendSignal('SIGTERM');
    forceKillTimer = setTimeout(() => sendSignal('SIGKILL'), 150);
    forceKillTimer.unref?.();
  };

  child.stdout.on('data', chunk => {
    if (appendBounded(stdout, Buffer.from(chunk), maxOutput)) {
      outputLimited = true;
      terminate();
    }
  });
  child.stderr.on('data', chunk => {
    if (appendBounded(stderr, Buffer.from(chunk), maxOutput)) {
      outputLimited = true;
      terminate();
    }
  });
  child.on('error', error => { spawnError = error.name; });
  child.stdin.on('error', error => {
    stdinError = error.name;
    terminate();
  });

  const timeoutMs = Math.min(batch.timeoutMs ?? Number.MAX_SAFE_INTEGER, transport.timeoutMs ?? 30000);
  const timeout = setTimeout(() => {
    timedOut = true;
    terminate();
  }, timeoutMs);
  const abort = () => {
    aborted = true;
    terminate();
  };
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });

  child.stdin.end(JSON.stringify({
    protocol: 'q1x-desktop-bridge/1',
    endpoint: { id: endpoint.id, platform: endpoint.platform },
    batch
  }));

  const code = await new Promise<number | null>(resolve => {
    child.once('close', value => resolve(value));
  });

  clearTimeout(timeout);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  signal?.removeEventListener('abort', abort);
  return {
    code,
    stdout: collected(stdout),
    stderr: collected(stderr),
    timedOut,
    aborted,
    outputLimited,
    ...(spawnError ? { spawnError } : {}),
    ...(stdinError ? { stdinError } : {})
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

function assertActionCorrelation(actions: DesktopActionResult[], batch: DesktopActionBatch, status: DesktopBatchResult['status']): void {
  const expected = batch.actions.map(action => action.id);
  if (actions.length > expected.length) {
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge returned too many action results');
  }
  for (let index = 0; index < actions.length; index += 1) {
    if (actions[index]?.id !== expected[index]) {
      throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge returned an action result that does not match the requested action order');
    }
  }
  if (status === 'succeeded' && actions.length !== expected.length) {
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge reported success without results for every requested action');
  }
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
  const actions = result.actions.map(normalizeAction);
  assertActionCorrelation(actions, batch, status as DesktopBatchResult['status']);
  const metadata = object(result.metadata);
  return {
    contractVersion: CONTRACT_VERSION,
    id: result.id,
    batchId: batch.id,
    status: status as DesktopBatchResult['status'],
    actions,
    ...(typeof result.startedAt === 'string' ? { startedAt: result.startedAt } : {}),
    ...(typeof result.finishedAt === 'string' ? { finishedAt: result.finishedAt } : {}),
    ...(metadata ? { metadata } : {})
  };
}

class StdioDesktopBridgeBackend implements DesktopBackend {
  readonly id = 'stdio-bridge';

  async execute(endpoint: DesktopEndpoint, batch: DesktopActionBatch, signal?: AbortSignal): Promise<DesktopBatchResult> {
    if (signal?.aborted) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge execution was cancelled');
    const outcome = await runBridge(endpoint, batch, signal);
    if (outcome.timedOut) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge timed out');
    if (outcome.aborted) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge execution was cancelled');
    if (outcome.outputLimited) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge exceeded the configured output limit');
    if (outcome.spawnError) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', `Desktop bridge failed to start (${outcome.spawnError})`);
    if (outcome.stdinError) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', `Desktop bridge stdin failed (${outcome.stdinError})`);
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
