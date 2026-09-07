import { spawn } from 'node:child_process';
import { CONTRACT_VERSION } from '@quoralinex/q1x-community-contracts';
import type { AdapterEndpoint, AdapterStdioTransport, ExecutionRequest, ExecutionResult } from '@quoralinex/q1x-community-sdk';
import { resolveAdapterEnvironment } from './adapter-security.js';
import type { AdapterTransport, AdapterTransportContext } from './adapter-transport.js';
import { RuntimeError } from './errors.js';

type JsonRecord = Record<string, unknown>;

interface ProcessOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  outputLimited: boolean;
  spawnError?: string;
}

function desktopTransport(endpoint: AdapterEndpoint): AdapterStdioTransport {
  if (endpoint.adapterKind !== 'desktop-control') {
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge protocol requires a desktop-control endpoint');
  }
  if (endpoint.transport.kind !== 'stdio') {
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop bridge requires a stdio transport');
  }
  return endpoint.transport;
}

function failed(request: ExecutionRequest, startedAt: string, code: string, message: string, retryable = false): ExecutionResult {
  return {
    contractVersion: CONTRACT_VERSION,
    id: `${request.id}.result`, requestId: request.id, workItemId: request.workItemId,
    status: 'failed',
    error: { code, message, retryable },
    startedAt, finishedAt: new Date().toISOString()
  };
}

async function runBridge(endpoint: AdapterEndpoint, request: ExecutionRequest, context: AdapterTransportContext): Promise<ProcessOutcome> {
  const transport = desktopTransport(endpoint);
  const limit = transport.maxOutputBytes ?? 4 * 1024 * 1024;
  const env = resolveAdapterEnvironment(transport, context.env ?? process.env);
  const child = spawn(transport.command, transport.args ?? [], {
    cwd: transport.cwd,
    env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let outputLimited = false;
  let timedOut = false;
  let aborted = false;
  let spawnError: string | undefined;

  const append = (target: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> => {
    const next = Buffer.concat([target, chunk]);
    if (next.length > limit) {
      outputLimited = true;
      child.kill();
      return next.subarray(0, limit);
    }
    return next;
  };

  child.stdout.on('data', chunk => { stdout = append(stdout, Buffer.from(chunk)); });
  child.stderr.on('data', chunk => { stderr = append(stderr, Buffer.from(chunk)); });
  child.on('error', error => { spawnError = error.name; });

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, transport.timeoutMs ?? 30000);

  const abort = () => {
    aborted = true;
    child.kill();
  };
  context.signal?.addEventListener('abort', abort, { once: true });

  const bridgeRequest = {
    protocol: 'q1x-desktop-bridge/1',
    requestId: request.id,
    workItemId: request.workItemId,
    input: request.input
  };
  child.stdin.end(JSON.stringify(bridgeRequest));

  const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.on('close', (code, signal) => resolve({ code, signal }));
  });

  clearTimeout(timeout);
  context.signal?.removeEventListener('abort', abort);
  return {
    ...outcome,
    stdout: stdout.toString('utf8'),
    stderr: stderr.toString('utf8'),
    timedOut,
    aborted,
    outputLimited,
    ...(spawnError ? { spawnError } : {})
  };
}

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function errorCode(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'DESKTOP_BRIDGE_ERROR';
  return value.toUpperCase().replace(/[^A-Z0-9_:-]+/g, '_').slice(0, 120) || 'DESKTOP_BRIDGE_ERROR';
}

class DesktopJsonStdioTransport implements AdapterTransport {
  readonly protocol = 'desktop-json-stdio-v1';

  async execute(endpoint: AdapterEndpoint, request: ExecutionRequest, context: AdapterTransportContext = {}): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const outcome = await runBridge(endpoint, request, context);

    if (outcome.timedOut) return failed(request, startedAt, 'DESKTOP_TIMEOUT', 'Desktop bridge timed out', true);
    if (outcome.aborted) {
      return {
        contractVersion: CONTRACT_VERSION,
        id: `${request.id}.result`, requestId: request.id, workItemId: request.workItemId,
        status: 'cancelled',
        error: { code: 'DESKTOP_CANCELLED', message: 'Desktop bridge execution was cancelled', retryable: true },
        startedAt, finishedAt: new Date().toISOString()
      };
    }
    if (outcome.outputLimited) return failed(request, startedAt, 'DESKTOP_OUTPUT_LIMIT', 'Desktop bridge exceeded the configured output limit');
    if (outcome.spawnError) return failed(request, startedAt, 'DESKTOP_SPAWN_ERROR', `Desktop bridge failed to start (${outcome.spawnError})`);
    if (outcome.code !== 0) return failed(request, startedAt, `DESKTOP_EXIT_${outcome.code ?? 'SIGNAL'}`, 'Desktop bridge exited unsuccessfully');

    let payload: unknown;
    try { payload = JSON.parse(outcome.stdout.trim() || 'null') as unknown; }
    catch { return failed(request, startedAt, 'DESKTOP_OUTPUT_INVALID', 'Desktop bridge returned invalid JSON'); }

    const response = record(payload);
    if (response?.ok === false) {
      const bridgeError = record(response.error);
      const code = errorCode(bridgeError?.code);
      const message = typeof bridgeError?.message === 'string' ? bridgeError.message : 'Desktop bridge reported a failure';
      const retryable = bridgeError?.retryable === true;
      return failed(request, startedAt, code, message, retryable);
    }

    const output = response?.ok === true && Object.prototype.hasOwnProperty.call(response, 'output')
      ? response.output
      : payload;
    const finishedAt = new Date().toISOString();
    return {
      contractVersion: CONTRACT_VERSION,
      id: `${request.id}.result`, requestId: request.id, workItemId: request.workItemId,
      status: 'succeeded', output,
      usage: { durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)) },
      startedAt, finishedAt
    };
  }
}

export function createDesktopAdapterTransport(): AdapterTransport {
  return new DesktopJsonStdioTransport();
}
