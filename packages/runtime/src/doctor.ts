import { createMacosDoctor } from '@quoralinex/q1x-community-desktop-bridge-macos/macos';
import { createWindowsDoctor } from '@quoralinex/q1x-community-desktop-bridge-windows/windows';
import { createLinuxDoctor } from '@quoralinex/q1x-community-desktop-bridge-linux/linux';
import { desktopPlatformForHost } from './desktop-security.js';
import { getFirstPartyDesktopBridge } from './first-party-desktop.js';
import type { OpenControlRuntime } from './runtime.js';
import { listConfiguredConnectors } from './connectors/configuration.js';
import {
  aggregateDiagnosticState,
  commandExistsOnPath,
  runConnectorPreflight,
  type ConnectorPreflightReport,
  type DiagnosticCheck,
  type DiagnosticState,
} from './connectors/preflight.js';

interface NativeDoctorCheck {
  id: string;
  state: DiagnosticState;
  message: string;
  remediation?: string;
}

interface NativeDoctorReport {
  platform: 'macos' | 'windows' | 'linux';
  state: DiagnosticState;
  checks: NativeDoctorCheck[];
}

export interface DoctorOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  commandExists?: (command: string) => Promise<boolean>;
  desktopDoctor?: (platform: 'macos' | 'windows' | 'linux') => Promise<NativeDoctorReport>;
}

export interface DoctorReport {
  contractVersion: '1.0.0';
  state: DiagnosticState;
  platform: string;
  home: string;
  checks: DiagnosticCheck[];
  connectors: ConnectorPreflightReport[];
}

async function runNativeDoctor(platform: 'macos' | 'windows' | 'linux'): Promise<NativeDoctorReport> {
  if (platform === 'macos') return createMacosDoctor();
  if (platform === 'windows') return createWindowsDoctor();
  return createLinuxDoctor();
}

export async function runDoctor(runtime: OpenControlRuntime, options: DoctorOptions = {}): Promise<DoctorReport> {
  const checks: DiagnosticCheck[] = [];
  const connectors: ConnectorPreflightReport[] = [];
  const status = runtime.getStatus();
  checks.push({
    id: 'runtime',
    state: 'ok',
    message: 'Community Orchestrator local runtime state is readable.',
    evidence: { databasePath: status.databasePath, contractVersion: status.contractVersion },
  });

  const hostPlatform = options.platform ?? process.platform;
  const desktopPlatform = desktopPlatformForHost(hostPlatform);
  if (!desktopPlatform) {
    checks.push({
      id: 'platform',
      state: 'unsupported',
      message: `Host operating system ${hostPlatform} is not a supported Phase 12 desktop platform.`,
      remediation: 'Use Windows, macOS or Linux for baseline desktop usability.',
    });
  } else {
    checks.push({ id: 'platform', state: 'ok', message: `${desktopPlatform} host recognized.` });
    const bridge = getFirstPartyDesktopBridge(hostPlatform);
    const env = options.env ?? process.env;
    const exists = options.commandExists ?? (command => commandExistsOnPath(command, env));
    const bridgeAvailable = await exists(bridge.command);
    checks.push(bridgeAvailable
      ? { id: 'desktop-bridge', state: 'ok', message: `Bundled first-party desktop bridge is available: ${bridge.command}.`, evidence: { command: bridge.command } }
      : { id: 'desktop-bridge', state: 'blocked', message: `Bundled first-party desktop bridge is not available on PATH: ${bridge.command}.`, remediation: 'Install the complete Q1X Community runtime package set so the matching first-party bridge executable is installed.', evidence: { command: bridge.command } });

    const nativeDoctor = options.desktopDoctor ?? runNativeDoctor;
    const native = await nativeDoctor(desktopPlatform);
    for (const check of native.checks) {
      checks.push({
        id: `desktop:${check.id}`,
        state: check.state,
        message: check.message,
        ...(check.remediation ? { remediation: check.remediation } : {}),
      });
    }
  }

  const configured = listConfiguredConnectors(runtime.home);
  if (configured.length === 0) {
    checks.push({
      id: 'connectors',
      state: 'not-configured',
      message: 'No connectors are configured in this local runtime.',
      remediation: 'Run q1x connectors list, then q1x connectors add <id> for the integrations you want to use.',
    });
  } else {
    for (const item of configured) {
      const report = await runConnectorPreflight(runtime.home, item.id, {
        platform: hostPlatform,
        env: options.env,
        commandExists: options.commandExists,
        desktopDoctor: options.desktopDoctor,
      });
      connectors.push(report);
      checks.push({
        id: `connector:${item.id}`,
        state: report.state,
        message: `Connector ${item.id} preflight is ${report.state}.`,
        evidence: { connectorId: item.id, enabled: item.enabled },
      });
    }
  }

  return {
    contractVersion: '1.0.0',
    state: aggregateDiagnosticState(checks),
    platform: desktopPlatform ?? String(hostPlatform),
    home: runtime.home,
    checks,
    connectors,
  };
}
