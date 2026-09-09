import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawn } from 'node:child_process';
import type { DesktopBatchResult } from '@quoralinex/q1x-community-sdk';
import {
  BRIDGE_PROTOCOL,
  type BridgeDoctorResult,
  type DesktopBridgeEnvelope,
} from '@quoralinex/q1x-community-desktop-bridge-common';
import { WINDOWS_UIA_PROBE, WINDOWS_UIA_WORKER } from './powershell.js';

export const supportedWindowsActions = Object.freeze([
  'list-applications', 'launch-application', 'focus-application', 'close-application',
  'list-windows', 'focus-window', 'inspect', 'find', 'click', 'double-click',
  'type', 'press', 'set-value', 'select', 'toggle', 'mouse-move', 'mouse-down',
  'mouse-up', 'wheel', 'drag', 'wait', 'screenshot',
] as const);

export interface WindowsInvocation {
  command: string;
  args: string[];
  stdin: string;
  shell: false;
}

export interface WindowsDoctorOptions {
  platform?: NodeJS.Platform;
  powershellCommand?: string | null;
  uiAutomationAvailable?: boolean;
}

function aggregateDoctorState(checks: BridgeDoctorResult['checks']): BridgeDoctorResult['state'] {
  const order: BridgeDoctorResult['state'][] = ['blocked', 'unsupported', 'warning', 'not-configured', 'ok'];
  return order.find(state => checks.some(check => check.state === state)) ?? 'ok';
}

function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function discoverPowerShell(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  const candidates: string[] = [];
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (systemRoot) {
    candidates.push(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
  }
  for (const entry of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    candidates.push(join(entry, 'pwsh.exe'), join(entry, 'powershell.exe'));
  }
  for (const candidate of candidates) {
    if (await executable(candidate)) return candidate;
  }
  return null;
}

function run(command: string, args: string[], stdin = '', timeoutMs = 30_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
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

async function probeUiAutomation(command: string): Promise<boolean> {
  try {
    const result = await run(command, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(WINDOWS_UIA_PROBE)], '', 15_000);
    if (result.code !== 0) return false;
    const value = JSON.parse(result.stdout.trim()) as { available?: unknown };
    return value.available === true;
  } catch {
    return false;
  }
}

export async function createWindowsDoctor(options: WindowsDoctorOptions = {}): Promise<BridgeDoctorResult> {
  const platform = options.platform ?? process.platform;
  const checks: BridgeDoctorResult['checks'] = [];
  if (platform !== 'win32') {
    checks.push({ id: 'platform', state: 'unsupported', message: `Windows bridge cannot run on ${platform}.`, remediation: 'Use the first-party bridge matching the current operating system.' });
    return { protocol: BRIDGE_PROTOCOL, platform: 'windows', state: 'unsupported', checks };
  }
  checks.push({ id: 'platform', state: 'ok', message: 'Windows host detected.' });

  const powershellCommand = options.powershellCommand === undefined ? await discoverPowerShell() : options.powershellCommand;
  checks.push(powershellCommand
    ? { id: 'powershell', state: 'ok', message: `PowerShell runtime is available at ${powershellCommand}.` }
    : { id: 'powershell', state: 'blocked', message: 'PowerShell runtime is unavailable.', remediation: 'Install or enable Windows PowerShell 5.1+ or PowerShell 7+ and ensure powershell.exe or pwsh.exe is available on PATH.' });

  if (powershellCommand) {
    const uiAutomationAvailable = options.uiAutomationAvailable ?? await probeUiAutomation(powershellCommand);
    checks.push(uiAutomationAvailable
      ? { id: 'uiautomation', state: 'ok', message: 'Windows UI Automation assemblies are available.' }
      : { id: 'uiautomation', state: 'blocked', message: 'Windows UI Automation is unavailable.', remediation: 'Use a supported Windows desktop session with the .NET UI Automation assemblies available. Elevated target windows may require a separately elevated Q1X host process; the bridge never elevates itself.' });
  } else if (options.uiAutomationAvailable === false) {
    checks.push({ id: 'uiautomation', state: 'blocked', message: 'Windows UI Automation cannot be checked without PowerShell.', remediation: 'Restore PowerShell first, then run q1x-desktop-bridge-windows --doctor --json again.' });
  }

  return { protocol: BRIDGE_PROTOCOL, platform: 'windows', state: aggregateDoctorState(checks), checks };
}

export function createWindowsPowerShellInvocation(envelope: DesktopBridgeEnvelope, command = 'powershell.exe'): WindowsInvocation {
  return {
    command,
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(WINDOWS_UIA_WORKER)],
    stdin: JSON.stringify(envelope),
    shell: false,
  };
}

export async function runWindowsBridge(envelope: DesktopBridgeEnvelope): Promise<DesktopBatchResult> {
  if (process.platform !== 'win32') throw new Error(`Windows bridge cannot run on ${process.platform}`);
  if (envelope.endpoint.platform !== 'windows' && envelope.endpoint.platform !== 'any') throw new Error(`endpoint platform ${envelope.endpoint.platform} is incompatible with Windows`);

  const command = await discoverPowerShell();
  if (!command) throw new Error('PowerShell runtime is unavailable');
  const invocation = createWindowsPowerShellInvocation(envelope, command);
  const result = await run(invocation.command, invocation.args, invocation.stdin, envelope.batch.timeoutMs ?? 30_000);
  if (result.code !== 0) {
    const message = result.stderr.trim().slice(0, 512) || `PowerShell worker exited with code ${result.code}`;
    throw new Error(message);
  }
  const parsed = JSON.parse(result.stdout.trim()) as DesktopBatchResult;
  if (parsed.contractVersion !== '1.0.0' || parsed.batchId !== envelope.batch.id || !Array.isArray(parsed.actions)) {
    throw new Error('Windows worker returned an invalid desktop batch result');
  }
  return parsed;
}
