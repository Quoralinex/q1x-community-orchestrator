import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { spawn } from 'node:child_process';
import type { DesktopAction, DesktopBatchResult } from '@quoralinex/q1x-community-sdk';
import {
  BRIDGE_PROTOCOL,
  type BridgeDoctorResult,
  type DesktopBridgeEnvelope,
} from '@quoralinex/q1x-community-desktop-bridge-common';
import { MACOS_ACCESSIBILITY_PROBE, MACOS_JXA_WORKER } from './jxa.js';

export const supportedMacosActions = Object.freeze([
  'list-applications', 'launch-application', 'focus-application', 'close-application',
  'list-windows', 'focus-window', 'inspect', 'find', 'click', 'double-click',
  'type', 'press', 'set-value', 'mouse-move', 'mouse-down', 'mouse-up', 'wheel',
  'drag', 'wait', 'screenshot',
] as const);

export interface MacosInvocation {
  command: string;
  args: string[];
  stdin: string;
  shell: false;
}

export interface MacosDoctorOptions {
  platform?: NodeJS.Platform;
  osascriptExists?: boolean;
  accessibilityTrusted?: boolean;
}

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

function run(command: string, args: string[], stdin = '', timeoutMs = 15_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
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

async function probeAccessibility(): Promise<boolean> {
  try {
    const result = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MACOS_ACCESSIBILITY_PROBE]);
    if (result.code !== 0) return false;
    const value = JSON.parse(result.stdout.trim()) as { enabled?: unknown };
    return value.enabled === true;
  } catch {
    return false;
  }
}

export async function createMacosDoctor(options: MacosDoctorOptions = {}): Promise<BridgeDoctorResult> {
  const platform = options.platform ?? process.platform;
  const checks: BridgeDoctorResult['checks'] = [];
  if (platform !== 'darwin') {
    checks.push({ id: 'platform', state: 'unsupported', message: `macOS bridge cannot run on ${platform}.`, remediation: 'Use the first-party bridge matching the current operating system.' });
    return { protocol: BRIDGE_PROTOCOL, platform: 'macos', state: 'unsupported', checks };
  }
  checks.push({ id: 'platform', state: 'ok', message: 'macOS host detected.' });

  const hasOsascript = options.osascriptExists ?? await executable('/usr/bin/osascript');
  checks.push(hasOsascript
    ? { id: 'osascript', state: 'ok', message: '/usr/bin/osascript is available.' }
    : { id: 'osascript', state: 'blocked', message: '/usr/bin/osascript is unavailable.', remediation: 'Use a supported macOS installation with the built-in osascript runtime.' });

  if (hasOsascript) {
    const trusted = options.accessibilityTrusted ?? await probeAccessibility();
    checks.push(trusted
      ? { id: 'accessibility', state: 'ok', message: 'macOS Accessibility automation is available.' }
      : { id: 'accessibility', state: 'blocked', message: 'macOS Accessibility permission is not available.', remediation: 'Open System Settings > Privacy & Security > Accessibility and grant Accessibility access to the terminal or Q1X host process that launches the bridge.' });
  }

  return { protocol: BRIDGE_PROTOCOL, platform: 'macos', state: aggregateDoctorState(checks), checks };
}

export function createMacosJxaInvocation(envelope: DesktopBridgeEnvelope): MacosInvocation {
  return {
    command: '/usr/bin/osascript',
    args: ['-l', 'JavaScript', '-e', MACOS_JXA_WORKER],
    stdin: JSON.stringify(envelope),
    shell: false,
  };
}

async function runJxa(envelope: DesktopBridgeEnvelope): Promise<DesktopBatchResult> {
  const invocation = createMacosJxaInvocation(envelope);
  const result = await run(invocation.command, invocation.args, invocation.stdin, envelope.batch.timeoutMs ?? 30_000);
  if (result.code !== 0) {
    const message = result.stderr.trim().slice(0, 512) || `osascript exited with code ${result.code}`;
    throw new Error(message);
  }
  return JSON.parse(result.stdout.trim()) as DesktopBatchResult;
}

async function runScreenshot(action: DesktopAction): Promise<DesktopBatchResult['actions'][number]> {
  const started = Date.now();
  if (!action.outputPath) {
    return { id: action.id, status: 'failed', durationMs: Date.now() - started, error: { code: 'SCREENSHOT_PATH_REQUIRED', message: 'screenshot requires outputPath' } };
  }
  try {
    const result = await run('/usr/sbin/screencapture', ['-x', action.outputPath], '', action.timeoutMs ?? 30_000);
    if (result.code !== 0) throw new Error(result.stderr.trim() || `screencapture exited with code ${result.code}`);
    return { id: action.id, status: 'succeeded', durationMs: Date.now() - started, output: { outputPath: action.outputPath } };
  } catch (error) {
    return { id: action.id, status: 'failed', durationMs: Date.now() - started, error: { code: 'MACOS_SCREENSHOT_FAILED', message: String(error instanceof Error ? error.message : error).slice(0, 512) } };
  }
}

export async function runMacosBridge(envelope: DesktopBridgeEnvelope): Promise<DesktopBatchResult> {
  if (process.platform !== 'darwin') throw new Error(`macOS bridge cannot run on ${process.platform}`);
  if (envelope.endpoint.platform !== 'macos' && envelope.endpoint.platform !== 'any') throw new Error(`endpoint platform ${envelope.endpoint.platform} is incompatible with macOS`);

  const startedAt = new Date().toISOString();
  const results: DesktopBatchResult['actions'] = [];
  for (const action of envelope.batch.actions) {
    let item: DesktopBatchResult['actions'][number];
    if (action.kind === 'screenshot') {
      item = await runScreenshot(action);
    } else {
      const single: DesktopBridgeEnvelope = { ...envelope, batch: { ...envelope.batch, actions: [action] } };
      const response = await runJxa(single);
      item = response.actions[0] ?? { id: action.id, status: 'failed', durationMs: 0, error: { code: 'MACOS_EMPTY_RESULT', message: 'macOS worker returned no action result' } };
    }
    results.push(item);
    if (item.status !== 'succeeded' && envelope.batch.stopOnError !== false) break;
  }

  const failures = results.filter(item => item.status !== 'succeeded').length;
  const status: DesktopBatchResult['status'] = failures === 0 ? 'succeeded' : results.some(item => item.status === 'succeeded') ? 'partial' : 'failed';
  return {
    contractVersion: '1.0.0',
    id: `${envelope.batch.id}.result`,
    batchId: envelope.batch.id,
    status,
    actions: results,
    startedAt,
    finishedAt: new Date().toISOString(),
    metadata: { bridge: 'q1x-macos-accessibility' },
  };
}
