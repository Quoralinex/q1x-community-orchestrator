import { resolve, relative } from 'node:path';
import { CONTRACT_VERSION } from '@quoralinex/q1x-community-contracts';
import type {
  DesktopAction,
  DesktopActionBatch,
  DesktopBatchResult,
  DesktopEndpoint
} from '@quoralinex/q1x-community-sdk';
import type {
  DesktopBackend,
  DesktopBackendProbe,
  DesktopBackendSession
} from './desktop-backend.js';
import { RuntimeError } from './errors.js';
import {
  findOnPath,
  isExecutable,
  runDirectProcess,
  type DirectProcessCommand
} from './desktop-process.js';

const OPEN = '/usr/bin/open';
const OSASCRIPT = '/usr/bin/osascript';
const SCREENCAPTURE = '/usr/sbin/screencapture';
function appFor(endpoint: DesktopEndpoint, applicationId?: string) {
  if (!applicationId) throw new RuntimeError('INVALID_REFERENCE', 'Desktop action requires an allowlisted application');
  const app = endpoint.allowedApplications.find(candidate => candidate.id === applicationId);
  if (!app) throw new RuntimeError('INVALID_REFERENCE', `Desktop application is not allowlisted: ${applicationId}`);
  return app;
}

function macSelector(endpoint: DesktopEndpoint, applicationId?: string): { bundleId?: string; name: string } {
  const app = appFor(endpoint, applicationId);
  const bundle = app.selectors.find(selector => selector.platform === 'macos' && selector.kind === 'bundle-id');
  const named = app.selectors.find(selector => selector.platform === 'macos' && selector.kind === 'application-name');
  return { ...(bundle ? { bundleId: bundle.value } : {}), name: named?.value ?? app.name };
}

function boundedScreenshot(endpoint: DesktopEndpoint, outputPath?: string): string {
  if (!endpoint.screenshotDir) throw new RuntimeError('UNSUPPORTED_OPERATION', 'Desktop endpoint has no screenshotDir');
  if (!outputPath) throw new RuntimeError('SCHEMA_INVALID', 'Screenshot action requires outputPath');
  const root = resolve(endpoint.screenshotDir);
  const target = resolve(root, outputPath);
  const rel = relative(root, target);
  if (rel.startsWith('..') || rel === '..') throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop screenshot path escapes screenshotDir');
  return target;
}
const JXA_ACTIVATE = 'function run(argv){ Application(argv[0]).activate(); }';
const JXA_QUIT = 'function run(argv){ Application(argv[0]).quit(); }';
const JXA_INSPECT = 'function run(argv){ var s=Application("System Events"); var p=s.processes.whose({name:argv[0]})(); return JSON.stringify(p.length?{running:true,name:p[0].name() }:{running:false,name:argv[0]}); }';
const JXA_TYPE = 'function run(argv){ Application("System Events").keystroke(argv[0]); }';
const JXA_PRESS = 'function run(argv){ var s=Application("System Events"); var map={return:36,enter:36,tab:48,escape:53,space:49,left:123,right:124,down:125,up:126}; var k=map[String(argv[0]).toLowerCase()]; if(k===undefined) throw new Error("unsupported key"); s.keyCode(k); }';

export function compileMacosDesktopAction(
  endpoint: DesktopEndpoint,
  action: DesktopAction,
  mouseTool?: string
): DirectProcessCommand {
  const timeoutMs = action.timeoutMs ?? endpoint.timeoutMs ?? 30000;
  if (action.kind === 'launch') {
    const app = macSelector(endpoint, action.applicationId);
    return { command: OPEN, args: app.bundleId ? ['-b', app.bundleId] : ['-a', app.name], timeoutMs };
  }
  if (action.kind === 'activate' || action.kind === 'quit' || action.kind === 'inspect') {
    const app = macSelector(endpoint, action.applicationId);
    const script = action.kind === 'activate' ? JXA_ACTIVATE : action.kind === 'quit' ? JXA_QUIT : JXA_INSPECT;
    return { command: OSASCRIPT, args: ['-l', 'JavaScript', '-e', script, app.name], timeoutMs };
  }
  if (action.kind === 'type') {
    appFor(endpoint, action.applicationId);
    return { command: OSASCRIPT, args: ['-l', 'JavaScript', '-e', JXA_TYPE, action.text ?? ''], timeoutMs };
  }
  if (action.kind === 'press') {
    appFor(endpoint, action.applicationId);
    return { command: OSASCRIPT, args: ['-l', 'JavaScript', '-e', JXA_PRESS, action.key ?? ''], timeoutMs };
  }
  if (action.kind === 'screenshot') {
    return { command: SCREENCAPTURE, args: ['-x', boundedScreenshot(endpoint, action.outputPath)], timeoutMs };
  }
  if (['mouse-move','click','double-click','mouse-down','mouse-up','drag','wheel'].includes(action.kind)) {
    if (!mouseTool) throw new RuntimeError('UNSUPPORTED_OPERATION', 'macOS mouse actions require cliclick');
    const x = Math.round(action.x ?? 0), y = Math.round(action.y ?? 0);
    const token = action.kind === 'mouse-move' ? `m:${x},${y}`
      : action.kind === 'click' ? `c:${x},${y}`
      : action.kind === 'double-click' ? `dc:${x},${y}`
      : action.kind === 'mouse-down' ? `dd:${x},${y}`
      : action.kind === 'mouse-up' ? `du:${x},${y}`
      : action.kind === 'drag' ? `m:${Math.round(action.source?.by === 'coordinates' ? action.source.x : x)},${Math.round(action.source?.by === 'coordinates' ? action.source.y : y)}`
      : `w:${Math.round(action.deltaY ?? 0)}`;
    return { command: mouseTool, args: [token], timeoutMs };
  }
  if (action.kind === 'wait') {
    throw new RuntimeError('UNSUPPORTED_OPERATION', 'Wait actions are handled by the desktop backend scheduler');
  }
  throw new RuntimeError('UNSUPPORTED_OPERATION', `macOS desktop action is unsupported: ${action.kind}`);
}
class MacosDesktopSession implements DesktopBackendSession {
  readonly endpointId: string;
  constructor(readonly endpoint: DesktopEndpoint) { this.endpointId = endpoint.id; }
  async close(): Promise<void> {}
}

function actionFailure(id: string, code: string, message: string, durationMs: number) {
  return { id, status: 'failed' as const, durationMs, error: { code, message } };
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolveSleep, reject) => {
    const timer = setTimeout(resolveSleep, ms);
    const abort = () => { clearTimeout(timer); reject(new RuntimeError('CANCELLED', 'Desktop execution cancelled')); };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
  });
}

class MacosDesktopBackend implements DesktopBackend {
  readonly id = 'macos-native';

  async probe(): Promise<DesktopBackendProbe> {
    const available = process.platform === 'darwin' && await isExecutable(OPEN) && await isExecutable(OSASCRIPT);
    const mouseTool = process.platform === 'darwin' ? await findOnPath('cliclick') : undefined;
    const operations = ['launch','activate','quit','inspect','type','press','wait'];
    if (await isExecutable(SCREENCAPTURE)) operations.push('screenshot');
    if (mouseTool) operations.push('mouse-move','click','double-click','mouse-down','mouse-up','drag','wheel');
    return {
      available,
      platform: 'macos',
      operations,
      ...(!available ? { reason: process.platform === 'darwin' ? 'Required macOS automation tools are unavailable' : 'Host is not macOS' } : {}),
      metadata: { mouseTool: mouseTool ?? 'unavailable' }
    };
  }

  async open(endpoint: DesktopEndpoint): Promise<DesktopBackendSession> {
    return new MacosDesktopSession(endpoint);
  }
  async execute(session: DesktopBackendSession, batch: DesktopActionBatch, signal?: AbortSignal): Promise<DesktopBatchResult> {
    if (!(session instanceof MacosDesktopSession)) throw new RuntimeError('INVALID_REFERENCE', 'Invalid macOS desktop session');
    const startedAt = new Date().toISOString();
    const results = [];
    const mouseTool = await findOnPath('cliclick');
    for (const action of batch.actions) {
      const started = Date.now();
      if (signal?.aborted) {
        results.push({ id: action.id, status: 'cancelled' as const, durationMs: Date.now() - started });
        break;
      }
      try {
        if (action.kind === 'wait') {
          await sleep(action.milliseconds ?? 0, signal);
          results.push({ id: action.id, status: 'succeeded' as const, durationMs: Date.now() - started });
          continue;
        }
        const command = compileMacosDesktopAction(session.endpoint, action, mouseTool);
        const outcome = await runDirectProcess(command, signal);
        if (outcome.timedOut) throw new RuntimeError('DESKTOP_TIMEOUT', 'Desktop command timed out');
        if (outcome.spawnError) throw new RuntimeError('DESKTOP_PROCESS_ERROR', `Desktop command failed to start (${outcome.spawnError})`);
        if (outcome.code !== 0) throw new RuntimeError('DESKTOP_PROCESS_ERROR', 'Desktop command exited unsuccessfully');
        let output: unknown = outcome.stdout.trim() || undefined;
        if (action.kind === 'inspect' && typeof output === 'string') {
          try { output = JSON.parse(output); } catch {}
        }
        results.push({ id: action.id, status: 'succeeded' as const, durationMs: Date.now() - started, ...(output !== undefined ? { output } : {}) });
      } catch (error) {
        const runtime = error instanceof RuntimeError ? error : new RuntimeError('DESKTOP_PROCESS_ERROR', 'Desktop action failed');
        results.push(actionFailure(action.id, runtime.code, runtime.message, Date.now() - started));
        if (batch.stopOnError !== false) break;
      }
    }
    const failedCount = results.filter(result => result.status === 'failed').length;
    const cancelledCount = results.filter(result => result.status === 'cancelled').length;
    const status = cancelledCount > 0 ? 'cancelled'
      : failedCount === 0 && results.length === batch.actions.length ? 'succeeded'
      : failedCount > 0 && failedCount === results.length ? 'failed'
      : 'partial';
    return {
      contractVersion: CONTRACT_VERSION,
      id: `${batch.id}.result`,
      batchId: batch.id,
      status,
      actions: results,
      startedAt,
      finishedAt: new Date().toISOString()
    };
  }
}

export function createMacosDesktopBackend(): DesktopBackend {
  return new MacosDesktopBackend();
}
