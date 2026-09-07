import { existsSync } from 'node:fs';
import { delimiter, join, relative, resolve } from 'node:path';
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
import { resolveDesktopApplication } from './desktop-security.js';
import { RuntimeError } from './errors.js';
import { runDirectProcess, type DirectProcessCommand } from './desktop-process.js';

export interface LinuxDesktopOptions {
  platform?: NodeJS.Platform | string;
  env?: NodeJS.ProcessEnv;
  commandExists?: (command: string) => boolean;
}

function defaultCommandExists(command: string, env: NodeJS.ProcessEnv): boolean {
  return (env.PATH ?? '').split(delimiter).filter(Boolean)
    .some(directory => existsSync(join(directory, command)));
}
function linuxSelector(endpoint: DesktopEndpoint, applicationId?: string) {
  if (!applicationId) {
    throw new RuntimeError('INVALID_REFERENCE', 'Desktop action requires an allowlisted application');
  }
  const app = resolveDesktopApplication(endpoint, applicationId);
  const selectors = app.selectors.filter(selector => selector.platform === 'linux');
  if (!selectors.length) {
    throw new RuntimeError('INVALID_REFERENCE', `Desktop application has no Linux selector: ${applicationId}`);
  }
  const command = selectors.find(selector => selector.kind === 'command');
  const process = selectors.find(selector => selector.kind === 'process-name');
  const desktopId = selectors.find(selector => selector.kind === 'desktop-id');
  return { app, command, process, desktopId };
}

function processClass(endpoint: DesktopEndpoint, applicationId?: string): string {
  const { process, command, desktopId } = linuxSelector(endpoint, applicationId);
  if (process) return process.value;
  if (command) return command.value.split('/').filter(Boolean).at(-1) ?? command.value;
  if (desktopId) return desktopId.value.replace(/\.desktop$/i, '');
  throw new RuntimeError('UNSUPPORTED_OPERATION', `Linux application has no process selector: ${applicationId}`);
}

function boundedScreenshot(endpoint: DesktopEndpoint, outputPath?: string): string {
  if (!endpoint.screenshotDir) throw new RuntimeError('UNSUPPORTED_OPERATION', 'Desktop endpoint has no screenshotDir');
  if (!outputPath) throw new RuntimeError('SCHEMA_INVALID', 'Screenshot action requires outputPath');
  const root = resolve(endpoint.screenshotDir);
  const target = resolve(root, outputPath);
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop screenshot path escapes screenshotDir');
  }
  return target;
}

function screenshotCommand(tool: string, target: string, timeoutMs: number): DirectProcessCommand {
  if (tool === 'scrot') return { command:'scrot', args:[target], timeoutMs };
  if (tool === 'import') return { command:'import', args:['-window','root',target], timeoutMs };
  return { command:'gnome-screenshot', args:['-f', target], timeoutMs };
}

function linuxKey(key?: string): string {
  const map: Record<string,string> = {
    enter:'Return', return:'Return', escape:'Escape', tab:'Tab', space:'space',
    left:'Left', right:'Right', up:'Up', down:'Down', backspace:'BackSpace', delete:'Delete'
  };
  const normalized = (key ?? '').toLowerCase();
  if (key?.length === 1) return key;
  const token = map[normalized];
  if (!token) throw new RuntimeError('UNSUPPORTED_OPERATION', `Unsupported Linux key: ${key ?? ''}`);
  return token;
}

function xdotool(args: string[], timeoutMs: number): DirectProcessCommand {
  return { command:'xdotool', args, timeoutMs };
}
export function compileLinuxX11DesktopAction(
  endpoint: DesktopEndpoint,
  action: DesktopAction,
  captureTool = 'gnome-screenshot'
): DirectProcessCommand {
  const timeoutMs = action.timeoutMs ?? endpoint.timeoutMs ?? 30000;
  if (action.kind === 'launch') {
    const { command, desktopId, process } = linuxSelector(endpoint, action.applicationId);
    if (command) return { command:command.value, args:[], timeoutMs };
    if (desktopId) return { command:'gtk-launch', args:[desktopId.value.replace(/\.desktop$/i, '')], timeoutMs };
    if (process) return { command:process.value, args:[], timeoutMs };
  }
  if (action.kind === 'activate') {
    return xdotool(['search','--onlyvisible','--class',processClass(endpoint, action.applicationId),'windowactivate','--sync'], timeoutMs);
  }
  if (action.kind === 'quit') {
    return xdotool(['search','--onlyvisible','--class',processClass(endpoint, action.applicationId),'windowclose'], timeoutMs);
  }
  if (action.kind === 'inspect') {
    return xdotool(['search','--onlyvisible','--class',processClass(endpoint, action.applicationId),'getwindowname'], timeoutMs);
  }
  if (action.kind === 'type') {
    linuxSelector(endpoint, action.applicationId);
    return xdotool(['type','--delay','0','--',action.text ?? ''], timeoutMs);
  }
  if (action.kind === 'press') {
    linuxSelector(endpoint, action.applicationId);
    return xdotool(['key', linuxKey(action.key)], timeoutMs);
  }
  if (action.kind === 'hotkey') {
    linuxSelector(endpoint, action.applicationId);
    const keys = action.keys ?? [];
    if (!keys.length) throw new RuntimeError('SCHEMA_INVALID', 'Linux hotkey requires keys');
    return xdotool(['key', keys.map(key => linuxKey(key)).join('+')], timeoutMs);
  }
  if (action.kind === 'screenshot') {
    return screenshotCommand(captureTool, boundedScreenshot(endpoint, action.outputPath), timeoutMs);
  }
  if (action.kind === 'mouse-move') {
    const x = Math.round(action.x ?? (action.target?.by === 'coordinates' ? action.target.x : 0));
    const y = Math.round(action.y ?? (action.target?.by === 'coordinates' ? action.target.y : 0));
    return xdotool(['mousemove',String(x),String(y)], timeoutMs);
  }
  if (action.kind === 'click' || action.kind === 'double-click') {
    const x = Math.round(action.x ?? (action.target?.by === 'coordinates' ? action.target.x : 0));
    const y = Math.round(action.y ?? (action.target?.by === 'coordinates' ? action.target.y : 0));
    const clicks = action.kind === 'double-click' ? '2' : '1';
    return xdotool(['mousemove',String(x),String(y),'click','--repeat',clicks,'1'], timeoutMs);
  }
  if (action.kind === 'mouse-down') return xdotool(['mousedown','1'], timeoutMs);
  if (action.kind === 'mouse-up') return xdotool(['mouseup','1'], timeoutMs);
  if (action.kind === 'wheel') {
    const clicks = Math.max(1, Math.abs(Math.round((action.deltaY ?? 0) / 120)));
    const button = (action.deltaY ?? 0) < 0 ? '4' : '5';
    return xdotool(['click','--repeat',String(clicks),button], timeoutMs);
  }
  if (action.kind === 'drag') {
    const source = action.source?.by === 'coordinates' ? action.source : undefined;
    const target = action.target?.by === 'coordinates' ? action.target : undefined;
    if (!source || !target) throw new RuntimeError('SCHEMA_INVALID', 'Linux drag requires coordinate source and target');
    return xdotool([
      'mousemove',String(Math.round(source.x)),String(Math.round(source.y)),
      'mousedown','1','mousemove',String(Math.round(target.x)),String(Math.round(target.y)),'mouseup','1'
    ], timeoutMs);
  }
  if (action.kind === 'wait') {
    throw new RuntimeError('UNSUPPORTED_OPERATION', 'Wait actions are handled by the desktop backend scheduler');
  }
  throw new RuntimeError('UNSUPPORTED_OPERATION', `Linux desktop action is unsupported: ${action.kind}`);
}

class LinuxDesktopSession implements DesktopBackendSession {
  readonly endpointId: string;
  constructor(readonly endpoint: DesktopEndpoint) { this.endpointId = endpoint.id; }
  async close(): Promise<void> {}
}
async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolveWait, reject) => {
    const timer = setTimeout(resolveWait, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new RuntimeError('CANCELLED', 'Desktop execution cancelled'));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once:true });
  });
}

class LinuxX11DesktopBackend implements DesktopBackend {
  readonly id = 'linux-x11';
  private readonly platform: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly exists: (command: string) => boolean;
  private readonly captureTool?: string;

  constructor(options: LinuxDesktopOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.env = options.env ?? process.env;
    this.exists = options.commandExists ?? (command => defaultCommandExists(command, this.env));
    this.captureTool = ['gnome-screenshot','scrot','import'].find(command => this.exists(command));
  }
  async probe(): Promise<DesktopBackendProbe> {
    if (this.platform !== 'linux') {
      return { available:false, platform:'linux', operations:[], reason:'Host is not Linux' };
    }
    const hasDisplay = Boolean(this.env.DISPLAY);
    const sessionType = (this.env.XDG_SESSION_TYPE ?? '').toLowerCase();
    if (!hasDisplay || (sessionType === 'wayland' && !this.env.DISPLAY)) {
      return { available:false, platform:'linux', operations:[], reason:'Linux desktop control requires an X11 DISPLAY' };
    }
    if (!this.exists('xdotool')) {
      return { available:false, platform:'linux', operations:[], reason:'xdotool is not installed' };
    }
    const operations = [
      'launch','activate','quit','inspect','type','press','hotkey','mouse-move','click',
      'double-click','mouse-down','mouse-up','wheel','drag','wait'
    ];
    if (this.captureTool) operations.push('screenshot');
    return {
      available:true,
      platform:'linux',
      operations,
      ...(!this.captureTool ? { metadata:{ screenshot:'unavailable' } } : {})
    };
  }

  async open(endpoint: DesktopEndpoint): Promise<DesktopBackendSession> {
    return new LinuxDesktopSession(endpoint);
  }
  async execute(session: DesktopBackendSession, batch: DesktopActionBatch, signal?: AbortSignal): Promise<DesktopBatchResult> {
    if (!(session instanceof LinuxDesktopSession)) {
      throw new RuntimeError('INVALID_REFERENCE', 'Invalid Linux desktop session');
    }
    const startedAt = new Date().toISOString();
    const results = [];
    for (const action of batch.actions) {
      const started = Date.now();
      if (signal?.aborted) {
        results.push({ id:action.id, status:'cancelled' as const, durationMs:Date.now() - started });
        break;
      }
      try {
        if (action.kind === 'wait') {
          await wait(action.milliseconds ?? 0, signal);
          results.push({ id:action.id, status:'succeeded' as const, durationMs:Date.now() - started });
          continue;
        }
        if (action.kind === 'screenshot' && !this.captureTool) {
          throw new RuntimeError('UNSUPPORTED_OPERATION', 'No Linux screenshot tool is installed');
        }
        const command = compileLinuxX11DesktopAction(session.endpoint, action, this.captureTool);
        const outcome = await runDirectProcess(command, signal);
        if (outcome.timedOut) throw new RuntimeError('DESKTOP_TIMEOUT', 'Desktop command timed out');
        if (outcome.spawnError) {
          throw new RuntimeError('DESKTOP_PROCESS_ERROR', `Desktop command failed to start (${outcome.spawnError})`);
        }
        if (outcome.code !== 0) throw new RuntimeError('DESKTOP_PROCESS_ERROR', 'Desktop command exited unsuccessfully');
        const output = outcome.stdout.trim() || undefined;
        results.push({
          id:action.id,
          status:'succeeded' as const,
          durationMs:Date.now() - started,
          ...(output !== undefined ? { output } : {})
        });
      } catch (error) {
        const runtime = error instanceof RuntimeError
          ? error
          : new RuntimeError('DESKTOP_PROCESS_ERROR', 'Desktop action failed');
        results.push({
          id:action.id,
          status:'failed' as const,
          durationMs:Date.now() - started,
          error:{ code:runtime.code, message:runtime.message }
        });
        if (batch.stopOnError !== false) break;
      }
    }
    const failures = results.filter(result => result.status === 'failed').length;
    const cancellations = results.filter(result => result.status === 'cancelled').length;
    const status = cancellations
      ? 'cancelled'
      : failures === 0 && results.length === batch.actions.length
        ? 'succeeded'
        : failures === results.length ? 'failed' : 'partial';
    return {
      contractVersion: CONTRACT_VERSION,
      id:`${batch.id}.result`,
      batchId:batch.id,
      status,
      actions:results,
      startedAt,
      finishedAt:new Date().toISOString()
    };
  }
}

export function createLinuxX11DesktopBackend(options: LinuxDesktopOptions = {}): DesktopBackend {
  return new LinuxX11DesktopBackend(options);
}
