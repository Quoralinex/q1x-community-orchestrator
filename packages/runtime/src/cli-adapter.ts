import { spawn } from 'node:child_process';
import { CONTRACT_VERSION } from '@quoralinex/q1x-community-contracts';
import type { AdapterEndpoint, AdapterStdioTransport, ExecutionRequest, ExecutionResult } from '@quoralinex/q1x-community-sdk';
import { resolveAdapterEnvironment } from './adapter-security.js';
import type { AdapterTransport, AdapterTransportContext } from './adapter-transport.js';
import { RuntimeError } from './errors.js';

interface ProcessOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputLimited: boolean;
  spawnError?: string;
}

function failed(request: ExecutionRequest, startedAt: string, code: string, message: string): ExecutionResult {
  return {
    contractVersion: CONTRACT_VERSION,
    id: `${request.id}.result`,
    requestId: request.id,
    workItemId: request.workItemId,
    status: 'failed',
    error: { code, message, retryable: code === 'CLI_TIMEOUT' },
    startedAt,
    finishedAt: new Date().toISOString()
  };
}
async function runProcess(endpoint: AdapterEndpoint, request: ExecutionRequest, context: AdapterTransportContext): Promise<ProcessOutcome> {
  if (endpoint.transport.kind !== 'stdio') throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'CLI adapter requires a stdio transport');
  const transport = endpoint.transport;
  const limit = transport.maxOutputBytes ?? 1024 * 1024;
  const env = resolveAdapterEnvironment(transport, context.env ?? process.env);
  const child = spawn(transport.command, transport.args ?? [], {
    cwd: transport.cwd,
    env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0), stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let outputLimited = false, timedOut = false, spawnError: string | undefined;
  const append = (target: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> => {
    const next = Buffer.concat([target, chunk]);
    if (next.length > limit) { outputLimited = true; child.kill(); return next.subarray(0, limit); }
    return next;
  };
  child.stdout.on('data', chunk => { stdout = append(stdout, Buffer.from(chunk)); });
  child.stderr.on('data', chunk => { stderr = append(stderr, Buffer.from(chunk)); });
  child.on('error', error => { spawnError = error.name; });
  const timeout = setTimeout(() => { timedOut = true; child.kill(); }, transport.timeoutMs ?? 30000);
  const abort = () => child.kill();
  context.signal?.addEventListener('abort', abort, { once: true });
  const inputMode = transport.inputMode ?? (endpoint.protocol === 'cli-text-stdio' ? 'text' : 'json');
  if (inputMode === 'none') child.stdin.end();
  else if (inputMode === 'text') child.stdin.end(typeof request.input === 'string' ? request.input : JSON.stringify(request.input));
  else child.stdin.end(JSON.stringify(request.input));

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
    outputLimited,
    ...(spawnError ? { spawnError } : {})
  };
}

async function executeCli(endpoint: AdapterEndpoint, request: ExecutionRequest, context: AdapterTransportContext = {}): Promise<ExecutionResult> {
  const startedAt = new Date().toISOString();
  const outcome = await runProcess(endpoint, request, context);
  if (outcome.timedOut) return failed(request, startedAt, 'CLI_TIMEOUT', 'CLI process timed out');
  if (outcome.outputLimited) return failed(request, startedAt, 'CLI_OUTPUT_LIMIT', 'CLI process exceeded the configured output limit');
  if (outcome.spawnError) return failed(request, startedAt, 'CLI_SPAWN_ERROR', `CLI process failed to start (${outcome.spawnError})`);
  if (outcome.code !== 0) return failed(request, startedAt, `CLI_EXIT_${outcome.code ?? 'SIGNAL'}`, 'CLI process exited unsuccessfully');
  const transport = endpoint.transport as AdapterStdioTransport;
  const outputMode = transport.outputMode ?? (endpoint.protocol === 'cli-text-stdio' ? 'text' : 'json');
  let output: unknown = outcome.stdout;
  if (outputMode === 'json') {
    try { output = JSON.parse(outcome.stdout.trim() || 'null') as unknown; }
    catch { return failed(request, startedAt, 'CLI_OUTPUT_INVALID', 'CLI process returned invalid JSON'); }
  }
  return {
    contractVersion: CONTRACT_VERSION,
    id: `${request.id}.result`,
    requestId: request.id,
    workItemId: request.workItemId,
    status: 'succeeded',
    output,
    usage: { durationMs: Math.max(0, Date.now() - Date.parse(startedAt)) },
    startedAt,
    finishedAt: new Date().toISOString()
  };
}

class CliJsonTransport implements AdapterTransport {
  readonly protocol = 'cli-json-stdio';
  execute(endpoint: AdapterEndpoint, request: ExecutionRequest, context?: AdapterTransportContext): Promise<ExecutionResult> {
    return executeCli(endpoint, request, context);
  }
}

class CliTextTransport implements AdapterTransport {
  readonly protocol = 'cli-text-stdio';
  execute(endpoint: AdapterEndpoint, request: ExecutionRequest, context?: AdapterTransportContext): Promise<ExecutionResult> {
    return executeCli(endpoint, request, context);
  }
}

export function createCliAdapterTransports(): AdapterTransport[] {
  return [new CliJsonTransport(), new CliTextTransport()];
}
