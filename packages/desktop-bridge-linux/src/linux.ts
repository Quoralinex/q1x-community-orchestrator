import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { DesktopBatchResult } from '@quoralinex/q1x-community-sdk';
import {
  BRIDGE_PROTOCOL,
  type BridgeDoctorResult,
  type DesktopBridgeEnvelope,
} from '@quoralinex/q1x-community-desktop-bridge-common';

export const supportedLinuxActions = Object.freeze([
  'list-applications', 'launch-application', 'focus-application', 'close-application',
  'list-windows', 'focus-window', 'inspect', 'find', 'click', 'double-click',
  'type', 'press', 'set-value', 'select', 'toggle', 'mouse-move', 'mouse-down',
  'mouse-up', 'wheel', 'drag', 'wait', 'screenshot',
] as const);

export interface LinuxInvocation {
  command: string;
  args: string[];
  stdin: string;
  shell: false;
}

export interface LinuxDoctorOptions {
  platform?: NodeJS.Platform;
  pythonCommand?: string | null;
  atspiAvailable?: boolean;
  displayAvailable?: boolean;
  sessionType?: string | null;
}

const bundledWorkerPath = fileURLToPath(new URL('../bridge/atspi_bridge.py', import.meta.url));

function aggregateDoctorState(checks: BridgeDoctorResult['checks']): BridgeDoctorResult['state'] {
  const order: BridgeDoctorResult['state'][] = ['blocked', 'unsupported', 'warning', 'not-configured', 'ok'];
  return order.find(state => checks.some(check => check.state === state)) ?? 'ok';
}

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function discoverPython(): Promise<string | null> {
  const candidates: string[] = ['/usr/bin/python3'];
  for (const entry of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    candidates.push(join(entry, 'python3'));
  }
  for (const candidate of candidates) {
    if (await executable(candidate)) return candidate;
  }
  return null;
}

function run(command: string, args: string[], stdin = '', timeoutMs = 30_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { if (stdout.length < 4 * 1024 * 1024) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < 64 * 1024) stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}

async function probeAtspi(command: string): Promise<boolean> {
  const script = [
    "import gi",
    "gi.require_version('Atspi','2.0')",
    "from gi.repository import Atspi",
    "root=Atspi.get_desktop(0)",
    "assert root is not None",
    "print('ok')",
  ].join(';');
  try {
    const result = await run(command, ['-c', script], '', 15_000);
    return result.code === 0 && result.stdout.trim() === 'ok';
  } catch {
    return false;
  }
}

function detectedSessionType(): string | null {
  const explicit = process.env.XDG_SESSION_TYPE?.trim().toLowerCase();
  if (explicit) return explicit;
  if (process.env.WAYLAND_DISPLAY) return 'wayland';
  if (process.env.DISPLAY) return 'x11';
  return null;
}

export async function createLinuxDoctor(options: LinuxDoctorOptions = {}): Promise<BridgeDoctorResult> {
  const platform = options.platform ?? process.platform;
  const checks: BridgeDoctorResult['checks'] = [];
  if (platform !== 'linux') {
    checks.push({ id: 'platform', state: 'unsupported', message: `Linux bridge cannot run on ${platform}.`, remediation: 'Use the first-party bridge matching the current operating system.' });
    return { protocol: BRIDGE_PROTOCOL, platform: 'linux', state: 'unsupported', checks };
  }
  checks.push({ id: 'platform', state: 'ok', message: 'Linux host detected.' });

  const pythonCommand = options.pythonCommand === undefined ? await discoverPython() : options.pythonCommand;
  checks.push(pythonCommand
    ? { id: 'python', state: 'ok', message: `Python 3 is available at ${pythonCommand}.` }
    : { id: 'python', state: 'blocked', message: 'Python 3 is unavailable.', remediation: 'Install Python 3 using the operating-system package manager and ensure python3 is on PATH.' });

  const displayAvailable = options.displayAvailable ?? Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  checks.push(displayAvailable
    ? { id: 'display', state: 'ok', message: 'A graphical desktop display/session is available.' }
    : { id: 'display', state: 'blocked', message: 'No graphical desktop display/session is available.', remediation: 'Run Q1X in the logged-in graphical desktop session or configure an authorized virtual display for automation.' });

  const sessionType = options.sessionType === undefined ? detectedSessionType() : options.sessionType;
  if (!sessionType) {
    checks.push({ id: 'session', state: 'blocked', message: 'Linux graphical session type could not be determined.', remediation: 'Run Q1X from a graphical X11 or Wayland session with XDG_SESSION_TYPE, DISPLAY or WAYLAND_DISPLAY available.' });
  } else if (sessionType.toLowerCase() === 'wayland') {
    checks.push({ id: 'session', state: 'warning', message: 'Wayland session detected. AT-SPI semantic actions remain available, but compositor policy may restrict global pointer, keyboard or screenshot synthesis.', remediation: 'Prefer semantic AT-SPI actions. For global input/capture, use a compositor-authorized session or X11 where required.' });
  } else {
    checks.push({ id: 'session', state: 'ok', message: `${sessionType.toUpperCase()} graphical session detected.` });
  }

  const atspiAvailable = options.atspiAvailable ?? (pythonCommand ? await probeAtspi(pythonCommand) : false);
  checks.push(atspiAvailable
    ? { id: 'atspi', state: 'ok', message: 'PyGObject and AT-SPI 2 are available and the desktop accessibility bus is reachable.' }
    : { id: 'atspi', state: 'blocked', message: 'PyGObject/AT-SPI 2 is unavailable or the accessibility bus is unreachable.', remediation: 'Install the distribution packages providing Python 3 PyGObject and AT-SPI 2 (commonly python3-gi and gir1.2-atspi-2.0) and run within an accessibility-enabled desktop session.' });

  return { protocol: BRIDGE_PROTOCOL, platform: 'linux', state: aggregateDoctorState(checks), checks };
}

export function createLinuxPythonInvocation(envelope: DesktopBridgeEnvelope, command = 'python3', workerPath = bundledWorkerPath): LinuxInvocation {
  return {
    command,
    args: [workerPath],
    stdin: JSON.stringify(envelope),
    shell: false,
  };
}

export async function runLinuxBridge(envelope: DesktopBridgeEnvelope): Promise<DesktopBatchResult> {
  if (process.platform !== 'linux') throw new Error(`Linux bridge cannot run on ${process.platform}`);
  if (envelope.endpoint.platform !== 'linux' && envelope.endpoint.platform !== 'any') throw new Error(`endpoint platform ${envelope.endpoint.platform} is incompatible with Linux`);

  const command = await discoverPython();
  if (!command) throw new Error('Python 3 is unavailable');
  const invocation = createLinuxPythonInvocation(envelope, command);
  const result = await run(invocation.command, invocation.args, invocation.stdin, envelope.batch.timeoutMs ?? 30_000);
  if (result.code !== 0) {
    const message = result.stderr.trim().slice(0, 512) || `AT-SPI worker exited with code ${result.code}`;
    throw new Error(message);
  }
  const parsed = JSON.parse(result.stdout.trim()) as DesktopBatchResult;
  if (parsed.contractVersion !== '1.0.0' || parsed.batchId !== envelope.batch.id || !Array.isArray(parsed.actions)) {
    throw new Error('Linux AT-SPI worker returned an invalid desktop batch result');
  }
  return parsed;
}
