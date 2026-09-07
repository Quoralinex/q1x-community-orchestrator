import { win32 } from 'node:path';
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
import { runDirectProcess, type DirectProcessCommand } from './desktop-process.js';

const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

const PS_ACTIVATE = `Add-Type @'\nusing System; using System.Runtime.InteropServices; public class W{[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);}\n'@; $p=Get-Process -Name $args[0] -ErrorAction Stop | Select-Object -First 1; [W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null`;
const PS_SENDKEYS = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait($args[0])`;
const PS_SCREENSHOT = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $i=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($i); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $i.Save($args[0]); $g.Dispose(); $i.Dispose()`;
function windowsApp(endpoint: DesktopEndpoint, applicationId?: string) {
  if (!applicationId) throw new RuntimeError('INVALID_REFERENCE', 'Desktop action requires an allowlisted application');
  const app = endpoint.allowedApplications.find(candidate => candidate.id === applicationId);
  if (!app) throw new RuntimeError('INVALID_REFERENCE', `Desktop application is not allowlisted: ${applicationId}`);
  const selectors = app.selectors.filter(selector => selector.platform === 'windows');
  if (!selectors.length) throw new RuntimeError('INVALID_REFERENCE', `Desktop application has no Windows selector: ${applicationId}`);
  const executable = selectors.find(selector => selector.kind === 'executable-path');
  const processName = selectors.find(selector => selector.kind === 'process-name');
  const appUserModelId = selectors.find(selector => selector.kind === 'app-user-model-id');
  return { app, executable, processName, appUserModelId };
}

function boundedScreenshot(endpoint: DesktopEndpoint, outputPath?: string): string {
  if (!endpoint.screenshotDir) throw new RuntimeError('UNSUPPORTED_OPERATION', 'Desktop endpoint has no screenshotDir');
  if (!outputPath) throw new RuntimeError('SCHEMA_INVALID', 'Screenshot action requires outputPath');
  const root = win32.resolve(endpoint.screenshotDir);
  const target = win32.resolve(root, outputPath);
  const rel = win32.relative(root, target);
  if (rel.startsWith('..') || rel === '..') throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop screenshot path escapes screenshotDir');
  return target;
}

function ps(script: string, data: string[], timeoutMs: number): DirectProcessCommand {
  return { command: POWERSHELL, args: ['-NoProfile', '-NonInteractive', '-Command', script, ...data], timeoutMs };
}
const PS_QUIT = `$p=Get-Process -Name $args[0] -ErrorAction Stop | Select-Object -First 1; if(-not $p.CloseMainWindow()){ Stop-Process -Id $p.Id }`;
const PS_INSPECT = `$p=Get-Process -Name $args[0] -ErrorAction SilentlyContinue | Select-Object -First 1; if($null -eq $p){ @{running=$false;name=$args[0]} | ConvertTo-Json -Compress } else { @{running=$true;name=$p.ProcessName;pid=$p.Id;title=$p.MainWindowTitle} | ConvertTo-Json -Compress }`;
const PS_MOUSE = `Add-Type @'\nusing System; using System.Runtime.InteropServices; public class M{[DllImport("user32.dll")] public static extern bool SetCursorPos(int X,int Y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint dx,uint dy,uint data,UIntPtr x);}\n'@; $k=$args[0]; $x=[int]$args[1]; $y=[int]$args[2]; [M]::SetCursorPos($x,$y)|Out-Null; if($k -eq 'click'){[M]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[M]::mouse_event(4,0,0,0,[UIntPtr]::Zero)} elseif($k -eq 'double-click'){1..2|%{[M]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[M]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}} elseif($k -eq 'mouse-down'){[M]::mouse_event(2,0,0,0,[UIntPtr]::Zero)} elseif($k -eq 'mouse-up'){[M]::mouse_event(4,0,0,0,[UIntPtr]::Zero)} elseif($k -eq 'wheel'){[M]::mouse_event(2048,0,0,[uint32]([int]$args[3]*120),[UIntPtr]::Zero)}`;

function windowsProcessName(endpoint: DesktopEndpoint, applicationId?: string): string {
  const { executable, processName } = windowsApp(endpoint, applicationId);
  if (processName) return processName.value.replace(/\.exe$/i, '');
  if (executable) return win32.basename(executable.value, win32.extname(executable.value));
  throw new RuntimeError('UNSUPPORTED_OPERATION', `Windows application has no process selector: ${applicationId}`);
}

function sendKeyToken(key?: string): string {
  const map: Record<string, string> = {
    return: '{ENTER}', enter: '{ENTER}', tab: '{TAB}', escape: '{ESC}',
    space: ' ', left: '{LEFT}', right: '{RIGHT}', up: '{UP}', down: '{DOWN}',
    backspace: '{BACKSPACE}', delete: '{DELETE}'
  };
  const token = map[(key ?? '').toLowerCase()];
  if (!token) throw new RuntimeError('UNSUPPORTED_OPERATION', `Unsupported Windows key: ${key ?? ''}`);
  return token;
}
export function compileWindowsDesktopAction(endpoint: DesktopEndpoint, action: DesktopAction): DirectProcessCommand {
  const timeoutMs = action.timeoutMs ?? endpoint.timeoutMs ?? 30000;
  if (action.kind === 'launch') {
    const { executable, appUserModelId, processName } = windowsApp(endpoint, action.applicationId);
    if (executable) return ps('Start-Process -FilePath $args[0]', [executable.value], timeoutMs);
    if (appUserModelId) return ps(`Start-Process explorer.exe -ArgumentList ('shell:AppsFolder\\'+$args[0])`, [appUserModelId.value], timeoutMs);
    if (processName) return ps('Start-Process -FilePath $args[0]', [processName.value], timeoutMs);
  }
  if (action.kind === 'activate') return ps(PS_ACTIVATE, [windowsProcessName(endpoint, action.applicationId)], timeoutMs);
  if (action.kind === 'quit') return ps(PS_QUIT, [windowsProcessName(endpoint, action.applicationId)], timeoutMs);
  if (action.kind === 'inspect') return ps(PS_INSPECT, [windowsProcessName(endpoint, action.applicationId)], timeoutMs);
  if (action.kind === 'type') {
    windowsApp(endpoint, action.applicationId);
    return ps(PS_SENDKEYS, [action.text ?? ''], timeoutMs);
  }
  if (action.kind === 'press') {
    windowsApp(endpoint, action.applicationId);
    return ps(PS_SENDKEYS, [sendKeyToken(action.key)], timeoutMs);
  }
  if (action.kind === 'hotkey') {
    windowsApp(endpoint, action.applicationId);
    const keys = action.keys ?? [];
    const modifiers = new Map([['ctrl','^'],['control','^'],['alt','%'],['shift','+']]);
    let prefix = '';
    let key = '';
    for (const item of keys) {
      const normalized = item.toLowerCase();
      if (modifiers.has(normalized)) prefix += modifiers.get(normalized);
      else key = item.length === 1 ? item : sendKeyToken(item);
    }
    if (!key) throw new RuntimeError('SCHEMA_INVALID', 'Windows hotkey requires a non-modifier key');
    return ps(PS_SENDKEYS, [`${prefix}${key}`], timeoutMs);
  }
  if (action.kind === 'screenshot') {
    return ps(PS_SCREENSHOT, [boundedScreenshot(endpoint, action.outputPath)], timeoutMs);
  }
  if (['mouse-move','click','double-click','mouse-down','mouse-up','wheel'].includes(action.kind)) {
    const x = Math.round(action.x ?? (action.target?.by === 'coordinates' ? action.target.x : 0));
    const y = Math.round(action.y ?? (action.target?.by === 'coordinates' ? action.target.y : 0));
    return ps(PS_MOUSE, [action.kind, String(x), String(y), String(Math.round(action.deltaY ?? 0))], timeoutMs);
  }
  if (action.kind === 'drag') {
    const source = action.source?.by === 'coordinates' ? action.source : undefined;
    const target = action.target?.by === 'coordinates' ? action.target : undefined;
    if (!source || !target) throw new RuntimeError('SCHEMA_INVALID', 'Windows drag requires coordinate source and target');
    const dragScript = `${PS_MOUSE}; [M]::SetCursorPos([int]$args[1],[int]$args[2])|Out-Null; [M]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [M]::SetCursorPos([int]$args[3],[int]$args[4])|Out-Null; [M]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`;
    return ps(dragScript, ['mouse-move', String(source.x), String(source.y), String(target.x), String(target.y)], timeoutMs);
  }
  if (action.kind === 'wait') throw new RuntimeError('UNSUPPORTED_OPERATION', 'Wait actions are handled by the desktop backend scheduler');
  throw new RuntimeError('UNSUPPORTED_OPERATION', `Windows desktop action is unsupported: ${action.kind}`);
}
class WindowsDesktopSession implements DesktopBackendSession {
  readonly endpointId: string;
  constructor(readonly endpoint: DesktopEndpoint) { this.endpointId = endpoint.id; }
  async close(): Promise<void> {}
}

async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolveWait, reject) => {
    const timer = setTimeout(resolveWait, ms);
    const abort = () => { clearTimeout(timer); reject(new RuntimeError('CANCELLED', 'Desktop execution cancelled')); };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
  });
}

class WindowsDesktopBackend implements DesktopBackend {
  readonly id = 'windows-native';
  async probe(): Promise<DesktopBackendProbe> {
    const available = process.platform === 'win32';
    return {
      available,
      platform: 'windows',
      operations: ['launch','activate','quit','inspect','type','press','hotkey','mouse-move','click','double-click','mouse-down','mouse-up','wheel','drag','wait','screenshot'],
      ...(!available ? { reason: 'Host is not Windows' } : {})
    };
  }
  async open(endpoint: DesktopEndpoint): Promise<DesktopBackendSession> { return new WindowsDesktopSession(endpoint); }
  async execute(session: DesktopBackendSession, batch: DesktopActionBatch, signal?: AbortSignal): Promise<DesktopBatchResult> {
    if (!(session instanceof WindowsDesktopSession)) throw new RuntimeError('INVALID_REFERENCE', 'Invalid Windows desktop session');
    const startedAt = new Date().toISOString();
    const results = [];
    for (const action of batch.actions) {
      const started = Date.now();
      if (signal?.aborted) {
        results.push({ id: action.id, status: 'cancelled' as const, durationMs: Date.now() - started });
        break;
      }
      try {
        if (action.kind === 'wait') {
          await wait(action.milliseconds ?? 0, signal);
          results.push({ id: action.id, status: 'succeeded' as const, durationMs: Date.now() - started });
          continue;
        }
        const outcome = await runDirectProcess(compileWindowsDesktopAction(session.endpoint, action), signal);
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
        results.push({ id: action.id, status: 'failed' as const, durationMs: Date.now() - started, error: { code: runtime.code, message: runtime.message } });
        if (batch.stopOnError !== false) break;
      }
    }
    const failures = results.filter(result => result.status === 'failed').length;
    const cancellations = results.filter(result => result.status === 'cancelled').length;
    const status = cancellations ? 'cancelled'
      : failures === 0 && results.length === batch.actions.length ? 'succeeded'
      : failures === results.length ? 'failed' : 'partial';
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

export function createWindowsDesktopBackend(): DesktopBackend {
  return new WindowsDesktopBackend();
}
